import { ipcMain, shell, app, BrowserWindow } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, VersionInfo, ScannerInfo, DownloadProgress } from '../shared/types'
import { createWriteStream, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { getScannerFactory, ScannerName } from './scanners'
import Store from 'electron-store'

// Settings store
const store = new Store<{ settings: UserSettings }>({
  defaults: {
    settings: {
      language: 'en',
      checkUpdatesOnStartup: true,
      autoDownloadUpdates: false,
      deleteAfterUse: false
    }
  }
})

let isScanning = false
let scanAbortController: AbortController | null = null

// Semver comparison: returns true if latest > current
function isNewerVersion(latest: string, current: string): boolean {
  const parseVersion = (v: string): number[] => {
    return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  }

  const latestParts = parseVersion(latest)
  const currentParts = parseVersion(current)

  for (let i = 0; i < 3; i++) {
    const l = latestParts[i] || 0
    const c = currentParts[i] || 0
    if (l > c) return true
    if (l < c) return false
  }
  return false
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  const scannerFactory = getScannerFactory()

  // Safe send to renderer (check if window is destroyed)
  const safeSend = (channel: string, data: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // Get scanner info
  ipcMain.handle(IPC_CHANNELS.GET_SCANNERS, (): ScannerInfo[] => {
    return scannerFactory.getScannerInfo()
  })

  // Start scan
  ipcMain.handle(IPC_CHANNELS.SCAN_START, async (_event, scannerIds?: ScannerName[]): Promise<ScanResult[]> => {
    if (isScanning) {
      throw new Error('Scan already in progress')
    }

    isScanning = true
    scanAbortController = new AbortController()
    scannerFactory.resetAll()

    const results: ScanResult[] = []
    const scanners = scannerIds
      ? scannerIds.map(id => scannerFactory.getScanner(id)).filter((s): s is NonNullable<typeof s> => s !== undefined)
      : scannerFactory.getAllScanners()

    try {
      for (let i = 0; i < scanners.length; i++) {
        if (scanAbortController.signal.aborted) break

        const scanner = scanners[i]

        // Send progress update for current scanner
        safeSend(IPC_CHANNELS.SCAN_PROGRESS, {
          scannerName: scanner.name,
          currentItem: i + 1,
          totalItems: scanners.length,
          currentPath: `Starting ${scanner.name}...`,
          percentage: (i / scanners.length) * 100
        } as ScanProgress)

        const result = await scanner.scan({
          onProgress: (progress: ScanProgress) => {
            safeSend(IPC_CHANNELS.SCAN_PROGRESS, progress)
          }
        })

        results.push(result)

        // Send individual result
        safeSend(IPC_CHANNELS.SCAN_RESULT, result)
      }

      safeSend(IPC_CHANNELS.SCAN_COMPLETE, results)
      return results
    } catch (error) {
      safeSend(IPC_CHANNELS.SCAN_ERROR, {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    } finally {
      isScanning = false
      scanAbortController = null
    }
  })

  // Cancel scan
  ipcMain.handle(IPC_CHANNELS.SCAN_CANCEL, async (): Promise<void> => {
    if (scanAbortController) {
      scanAbortController.abort()
    }
    scannerFactory.cancelAll()
    isScanning = false
  })

  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): UserSettings => {
    return store.get('settings')
  })

  // Set settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings: Partial<UserSettings>): UserSettings => {
    const current = store.get('settings')
    const updated = { ...current, ...settings }
    store.set('settings', updated)
    return updated
  })

  // Get app version
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, (): string => {
    return app.getVersion()
  })

  // Check for updates
  ipcMain.handle(IPC_CHANNELS.APP_CHECK_UPDATE, async (): Promise<VersionInfo> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch('https://api.github.com/repos/dybeky/custos/releases/latest', {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          currentVersion: app.getVersion(),
          isUpdateAvailable: false
        }
      }

      const data = await response.json() as {
        tag_name: string
        published_at: string
        body: string
        assets: Array<{ browser_download_url: string; size: number; name: string }>
      }

      const latestVersion = data.tag_name.replace('v', '')
      const currentVersion = app.getVersion()

      // Find the .exe asset
      const exeAsset = data.assets?.find(a => a.name.endsWith('.exe'))

      return {
        currentVersion,
        latestVersion,
        releaseDate: data.published_at,
        changelog: data.body,
        downloadUrl: exeAsset?.browser_download_url,
        fileSize: exeAsset?.size,
        isUpdateAvailable: isNewerVersion(latestVersion, currentVersion)
      }
    } catch {
      return {
        currentVersion: app.getVersion(),
        isUpdateAvailable: false
      }
    }
  })

  // Download and install update
  ipcMain.handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, async (_event, downloadUrl: string): Promise<void> => {
    // Validate URL
    if (!downloadUrl || (!downloadUrl.startsWith('https://github.com/') &&
        !downloadUrl.startsWith('https://objects.githubusercontent.com/'))) {
      throw new Error('Invalid download URL')
    }

    const tempDir = app.getPath('temp')
    const exePath = app.getPath('exe')
    const newExePath = join(tempDir, 'custos_new.exe')

    // Clean up any existing partial download
    try {
      if (existsSync(newExePath)) {
        unlinkSync(newExePath)
      }
    } catch { /* ignore */ }

    // Download file with progress
    await new Promise<void>((resolve, reject) => {
      let isResolved = false
      const MAX_REDIRECTS = 10

      const downloadFile = (url: string, redirectCount = 0) => {
        if (redirectCount > MAX_REDIRECTS) {
          reject(new Error('Too many redirects'))
          return
        }

        const protocol = url.startsWith('https') ? https : http

        const request = protocol.get(url, {
          headers: {
            'User-Agent': 'Custos-Updater'
          },
          timeout: 60000 // 60s timeout
        }, (response) => {
          // Handle redirects
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location
            if (redirectUrl) {
              downloadFile(redirectUrl, redirectCount + 1)
              return
            } else {
              reject(new Error('Redirect missing location header'))
              return
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: ${response.statusCode}`))
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedSize = 0
          let lastTime = Date.now()
          let lastDownloaded = 0
          let lastSpeed = 0

          const fileStream = createWriteStream(newExePath)

          const cleanup = () => {
            isResolved = true
            response.removeAllListeners('data')
            fileStream.removeAllListeners()
          }

          response.on('data', (chunk: Buffer) => {
            if (isResolved) return

            downloadedSize += chunk.length
            const currentTime = Date.now()
            const timeDiff = (currentTime - lastTime) / 1000

            if (timeDiff >= 0.3) {
              lastSpeed = (downloadedSize - lastDownloaded) / timeDiff
              lastTime = currentTime
              lastDownloaded = downloadedSize
            }

            const progress: DownloadProgress = {
              percent: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
              transferred: downloadedSize,
              total: totalSize,
              speed: lastSpeed
            }

            safeSend(IPC_CHANNELS.APP_DOWNLOAD_PROGRESS, progress)
          })

          response.pipe(fileStream)

          fileStream.on('finish', () => {
            cleanup()
            fileStream.close(() => resolve())
          })

          fileStream.on('error', (err) => {
            cleanup()
            fileStream.close()
            // Clean up partial file
            try { unlinkSync(newExePath) } catch { /* ignore */ }
            reject(err)
          })

          response.on('error', (err) => {
            cleanup()
            fileStream.close()
            try { unlinkSync(newExePath) } catch { /* ignore */ }
            reject(err)
          })
        })

        request.on('error', (err) => {
          // Clean up partial file
          try { unlinkSync(newExePath) } catch { /* ignore */ }
          reject(err)
        })

        request.on('timeout', () => {
          request.destroy()
          try { unlinkSync(newExePath) } catch { /* ignore */ }
          reject(new Error('Download timeout'))
        })
      }

      downloadFile(downloadUrl)
    })

    // Create batch file to replace exe and restart
    // Escape paths for batch file (double quotes handle most cases)
    const escapedNewPath = newExePath.replace(/"/g, '""')
    const escapedExePath = exePath.replace(/"/g, '""')

    const batchContent = `@echo off
chcp 65001 >nul
title Custos Update
echo Updating Custos...
:wait
tasklist /FI "IMAGENAME eq Custos.exe" 2>NUL | find /i "Custos.exe" >nul
if %errorlevel%==0 (
    timeout /t 1 /nobreak >nul
    goto wait
)
timeout /t 1 /nobreak >nul
copy /y "${escapedNewPath}" "${escapedExePath}"
if %errorlevel%==0 (
    del "${escapedNewPath}"
    start "" "${escapedExePath}"
) else (
    echo Update failed!
    pause
)
del "%~f0"
`
    const batchPath = join(tempDir, 'custos_update.bat')

    try {
      const { writeFileSync } = await import('fs')
      writeFileSync(batchPath, batchContent, 'utf8')

      const { exec } = await import('child_process')

      exec(`start "" "${batchPath}"`, { windowsHide: true }, (err) => {
        if (err) {
          console.error('Failed to start update batch:', err)
          // Don't quit if batch failed to start
          return
        }

        // Only quit if batch started successfully
        setTimeout(() => {
          app.quit()
        }, 500)
      })
    } catch (err) {
      // Clean up downloaded file if batch creation failed
      try { unlinkSync(newExePath) } catch { /* ignore */ }
      throw new Error('Failed to create update script')
    }
  })

  // Open external URL
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, async (_event, url: string): Promise<void> => {
    await shell.openExternal(url)
  })

  // Open path in explorer
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_PATH, async (_event, path: string): Promise<void> => {
    // Expand environment variables
    let expandedPath = path.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || ''
    })

    // Handle special URI schemes (ms-settings, windowsdefender, etc.)
    if (path.includes(':') && !path.match(/^[A-Z]:\\/i)) {
      await shell.openExternal(path)
      return
    }

    await shell.openPath(expandedPath)
  })

  // Open registry key
  ipcMain.handle('app:open-registry', async (_event, keyPath: string): Promise<void> => {
    const { exec } = await import('child_process')

    // Set the last key in regedit
    const fullPath = keyPath.replace('HKCU', 'HKEY_CURRENT_USER')

    // Write to registry to set last key
    exec(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit" /v "LastKey" /t REG_SZ /d "${fullPath}" /f`, (err) => {
      if (!err) {
        // Open regedit
        exec('regedit')
      }
    })
  })

  // Delete self (for "delete after use" feature)
  ipcMain.handle(IPC_CHANNELS.APP_DELETE_SELF, async (): Promise<void> => {
    const exePath = app.getPath('exe')
    const escapedPath = exePath.replace(/"/g, '""')

    // Create a batch file to delete the app after it closes
    const batchContent = `@echo off
:loop
tasklist /FI "IMAGENAME eq Custos.exe" 2>NUL | find /i "Custos.exe" >nul
if %errorlevel%==0 (
  timeout /t 1 /nobreak >nul
  goto loop
)
del "${escapedPath}"
del "%~f0"
`
    const { writeFileSync } = await import('fs')
    const batchPath = join(app.getPath('temp'), 'custos_cleanup.bat')
    writeFileSync(batchPath, batchContent, 'utf8')

    const { exec } = await import('child_process')
    exec(`start "" "${batchPath}"`, { windowsHide: true })

    app.quit()
  })

  // Quit app
  ipcMain.handle(IPC_CHANNELS.APP_QUIT, (): void => {
    app.quit()
  })

  // Window controls
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (): void => {
    mainWindow.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, (): void => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (): void => {
    mainWindow.close()
  })
}
