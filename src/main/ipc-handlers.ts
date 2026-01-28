import { ipcMain, shell, app, BrowserWindow } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, VersionInfo, ScannerInfo, DownloadProgress } from '../shared/types'
import { logger } from './services/logger'
import { createWriteStream, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import { getScannerFactory, ScannerName, BaseScanner } from './scanners'
import { ThrottledProgress } from './utils/progress-throttle'
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

  // Timeout wrapper for scanner - ensures no scanner hangs forever
  const SCANNER_TIMEOUT_MS = 30000 // 30 seconds max per scanner

  async function runScannerWithTimeout(
    scanner: BaseScanner,
    events: { onProgress: (progress: ScanProgress) => void }
  ): Promise<ScanResult> {
    const startTime = Date.now()
    logger.debug(`Scanner starting: ${scanner.name}`)

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn(`Scanner timeout: ${scanner.name}`, { timeoutMs: SCANNER_TIMEOUT_MS })
        scanner.cancel()
        resolve({
          scannerName: scanner.name,
          success: false,
          findings: [],
          error: `Scanner timeout (${SCANNER_TIMEOUT_MS / 1000}s)`,
          startTime: new Date(),
          endTime: new Date(),
          duration: SCANNER_TIMEOUT_MS,
          count: 0,
          hasFindings: false
        })
      }, SCANNER_TIMEOUT_MS)

      scanner.scan(events)
        .then(result => {
          clearTimeout(timeout)
          logger.debug(`Scanner completed: ${scanner.name}`, {
            duration: `${Date.now() - startTime}ms`,
            findings: result.findings.length
          })
          resolve(result)
        })
        .catch((err) => {
          clearTimeout(timeout)
          logger.error(`Scanner error: ${scanner.name}`, err)
          resolve({
            scannerName: scanner.name,
            success: false,
            findings: [],
            error: 'Scanner error',
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
            count: 0,
            hasFindings: false
          })
        })
    })
  }

  // Helper to run a group of scanners with concurrency limit
  async function runScannerGroup(
    scanners: BaseScanner[],
    concurrency: number,
    throttledProgress: ThrottledProgress,
    completedRef: { count: number },
    totalScanners: number
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = []
    const executing: Promise<void>[] = []

    for (const scanner of scanners) {
      if (scanAbortController?.signal.aborted) break

      const scanPromise = (async () => {
        // Send progress update for starting scanner
        safeSend(IPC_CHANNELS.SCAN_PROGRESS, {
          scannerName: scanner.name,
          currentItem: completedRef.count + 1,
          totalItems: totalScanners,
          currentPath: `Starting ${scanner.name}...`,
          percentage: (completedRef.count / totalScanners) * 100
        } as ScanProgress)

        const result = await runScannerWithTimeout(scanner, {
          onProgress: (progress: ScanProgress) => {
            throttledProgress.emit(progress, (p) => safeSend(IPC_CHANNELS.SCAN_PROGRESS, p))
          }
        })

        results.push(result)
        completedRef.count++

        // Send individual result
        safeSend(IPC_CHANNELS.SCAN_RESULT, result)
      })()

      executing.push(scanPromise)

      // Limit concurrency - use proper promise tracking with wrapper objects
      if (executing.length >= concurrency) {
        // Create wrapper promises that resolve to their original promise reference
        const wrappers = executing.map(p =>
          p.then(() => ({ promise: p })).catch(() => ({ promise: p }))
        )
        // Wait for any promise to settle and remove it by reference (not index)
        const { promise: completedPromise } = await Promise.race(wrappers)
        const idx = executing.indexOf(completedPromise)
        if (idx !== -1) {
          executing.splice(idx, 1)
        }
      }
    }

    await Promise.all(executing)
    return results
  }

  // Start scan
  ipcMain.handle(IPC_CHANNELS.SCAN_START, async (_event, scannerIds?: ScannerName[]): Promise<ScanResult[]> => {
    if (isScanning) {
      logger.warn('Scan already in progress')
      throw new Error('Scan already in progress')
    }

    logger.info('Scan started', { scannerIds: scannerIds || 'all' })
    isScanning = true
    scanAbortController = new AbortController()
    scannerFactory.resetAll()

    const allScanners = scannerIds
      ? scannerIds.map(id => scannerFactory.getScanner(id)).filter((s): s is NonNullable<typeof s> => s !== undefined)
      : scannerFactory.getAllScanners()

    // Group scanners by type for optimal parallel execution
    const scannerNameMap = new Map<BaseScanner, string>()
    allScanners.forEach(s => scannerNameMap.set(s, s.name.toLowerCase()))

    // Group A: File system scanners (can run all in parallel)
    const groupANames = ['appdata', 'prefetch', 'recent', 'game', 'steam']
    const groupA = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupANames.some(n => name.includes(n))
    })

    // Group B: Registry/PowerShell scanners (run in parallel with limit)
    const groupBNames = ['registry', 'bam', 'shellbag', 'amcache']
    const groupB = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupBNames.some(n => name.includes(n))
    })

    // Group C: Independent scanners (process, browser)
    const groupCNames = ['process', 'browser']
    const groupC = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupCNames.some(n => name.includes(n))
    })

    const throttledProgress = new ThrottledProgress(100)
    const completedRef = { count: 0 }
    const totalScanners = allScanners.length

    try {
      // Run all groups in parallel
      const [resultsA, resultsB, resultsC] = await Promise.all([
        runScannerGroup(groupA, 5, throttledProgress, completedRef, totalScanners),
        runScannerGroup(groupB, 4, throttledProgress, completedRef, totalScanners),
        runScannerGroup(groupC, 2, throttledProgress, completedRef, totalScanners)
      ])

      const results = [...resultsA, ...resultsB, ...resultsC]

      const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
      logger.info('Scan completed', {
        totalScanners: results.length,
        totalFindings,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      })

      safeSend(IPC_CHANNELS.SCAN_COMPLETE, results)
      return results
    } catch (error) {
      logger.error('Scan failed', error instanceof Error ? error : new Error(String(error)))
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

      // Helper for async-safe file cleanup
      const cleanupFile = async (): Promise<void> => {
        try {
          const { unlink } = await import('fs/promises')
          await unlink(newExePath)
        } catch { /* ignore - file may not exist */ }
      }

      const downloadFile = (url: string, redirectCount = 0): void => {
        if (isResolved) return

        if (redirectCount > MAX_REDIRECTS) {
          isResolved = true
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
          // Handle redirects - consume response and follow redirect
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Consume response data to free up memory
            response.resume()

            const redirectUrl = response.headers.location
            if (redirectUrl) {
              // Follow redirect recursively
              downloadFile(redirectUrl, redirectCount + 1)
            } else {
              isResolved = true
              reject(new Error('Redirect missing location header'))
            }
            return
          }

          if (response.statusCode !== 200) {
            isResolved = true
            response.resume()
            reject(new Error(`Download failed: ${response.statusCode}`))
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)
          let downloadedSize = 0
          let lastTime = Date.now()
          let lastDownloaded = 0
          let lastSpeed = 0

          const fileStream = createWriteStream(newExePath)

          const cleanup = (): void => {
            isResolved = true
            response.removeAllListeners()
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
            if (isResolved) return
            cleanup()
            fileStream.close(() => resolve())
          })

          fileStream.on('error', (err) => {
            if (isResolved) return
            cleanup()
            fileStream.close(() => {
              cleanupFile().finally(() => reject(err))
            })
          })

          response.on('error', (err) => {
            if (isResolved) return
            cleanup()
            fileStream.close(() => {
              cleanupFile().finally(() => reject(err))
            })
          })
        })

        request.on('error', (err) => {
          if (isResolved) return
          isResolved = true
          cleanupFile().finally(() => reject(err))
        })

        request.on('timeout', () => {
          if (isResolved) return
          isResolved = true
          request.destroy()
          cleanupFile().finally(() => reject(new Error('Download timeout')))
        })
      }

      downloadFile(downloadUrl)
    })

    // Create batch file to replace exe and restart
    // Escape paths for batch file - escape all special characters
    const escapeBatchPath = (path: string): string => {
      // First escape caret (^) as it's the escape character itself
      // Then escape other special characters: & | < > " %
      return path
        .replace(/\^/g, '^^')
        .replace(/&/g, '^&')
        .replace(/\|/g, '^|')
        .replace(/</g, '^<')
        .replace(/>/g, '^>')
        .replace(/"/g, '""')
        .replace(/%/g, '%%')
    }
    const escapedNewPath = escapeBatchPath(newExePath)
    const escapedExePath = escapeBatchPath(exePath)

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
    // Expand environment variables first
    const expandedPath = path.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || ''
    })

    // Handle special URI schemes AFTER expansion (ms-settings, windowsdefender, etc.)
    // Check on expandedPath, not original path
    if (expandedPath.includes(':') && !expandedPath.match(/^[A-Z]:\\/i)) {
      await shell.openExternal(expandedPath)
      return
    }

    await shell.openPath(expandedPath)
  })

  // Open registry key
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_REGISTRY, async (_event, keyPath: string): Promise<{ success: boolean; error?: string }> => {
    const { execFile } = await import('child_process')

    // Validate and sanitize keyPath to prevent command injection
    // Allow valid registry key characters: alphanumeric, backslash, underscore, hyphen, spaces, dots, parentheses
    // Dots are needed for paths like "Microsoft.Windows" and parentheses for "(x86)"
    if (!keyPath || !/^[A-Za-z0-9\\_\-\s.()]+$/.test(keyPath)) {
      logger.warn('Invalid registry key path', { keyPath })
      return { success: false, error: 'Invalid registry key path' }
    }

    // Expand HKCU to full form and add Computer\ prefix for Windows 10+ regedit navigation
    const fullPath = 'Computer\\' + keyPath
      .replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\')
      .replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\')
      .replace(/^HKU\\/i, 'HKEY_USERS\\')
      .replace(/^HKCR\\/i, 'HKEY_CLASSES_ROOT\\')
      .replace(/^HKCC\\/i, 'HKEY_CURRENT_CONFIG\\')

    // Get full path to regedit via SystemRoot environment variable
    const regeditPath = process.env.SystemRoot
      ? `${process.env.SystemRoot}\\regedit.exe`
      : 'C:\\Windows\\regedit.exe'

    return new Promise((resolve) => {
      // Use execFile instead of exec to prevent command injection
      // Pass arguments as array, not interpolated string
      execFile('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit',
        '/v', 'LastKey',
        '/t', 'REG_SZ',
        '/d', fullPath,
        '/f'
      ], (regErr) => {
        if (regErr) {
          logger.warn('Failed to set registry LastKey', { error: regErr.message })
          // Still try to open regedit even if setting LastKey failed
        }

        // Open regedit using full path
        execFile(regeditPath, (regeditErr) => {
          if (regeditErr) {
            logger.error('Failed to open regedit', { error: regeditErr.message, path: regeditPath })
            resolve({ success: false, error: `Failed to open regedit: ${regeditErr.message}` })
          } else {
            resolve({ success: true })
          }
        })
      })
    })
  })

  // Delete self (for "delete after use" feature)
  ipcMain.handle(IPC_CHANNELS.APP_DELETE_SELF, async (): Promise<void> => {
    const exePath = app.getPath('exe')
    // Escape paths for batch file - escape all special characters
    const escapeBatchPath = (path: string): string => {
      return path
        .replace(/\^/g, '^^')
        .replace(/&/g, '^&')
        .replace(/\|/g, '^|')
        .replace(/</g, '^<')
        .replace(/>/g, '^>')
        .replace(/"/g, '""')
        .replace(/%/g, '%%')
    }
    const escapedPath = escapeBatchPath(exePath)

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

  // Window controls with safety checks
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (): void => {
    try {
      if (!mainWindow.isDestroyed()) {
        mainWindow.minimize()
      }
    } catch (error) {
      logger.debug('Window minimize failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, (): void => {
    try {
      if (!mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize()
        } else {
          mainWindow.maximize()
        }
      }
    } catch (error) {
      logger.debug('Window maximize/unmaximize failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (): void => {
    try {
      if (!mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    } catch (error) {
      logger.debug('Window close failed', { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })
}
