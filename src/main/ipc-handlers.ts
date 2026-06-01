import { ipcMain, shell, app, BrowserWindow } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, ScannerInfo, OsInfo, ScannerCapability } from '../shared/types'
import { logger } from './services/logger'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { exec, execFile } from 'child_process'
import { getScannerFactory, ScannerName, BaseScanner } from './scanners'
import { getOsInfo, getTimeoutMultiplier } from './utils/os-utils'
import { getScannerCapabilities, getSupportedScannerIds, getAllCapabilities } from './services/capability-service'
import { ThrottledProgress } from './utils/progress-throttle'
import Store from 'electron-store'
import { z } from 'zod'

// Strict schema for partial user settings — rejects unknown properties
const UserSettingsPartialSchema = z.object({
  language: z.enum(['en', 'ru']).optional(),
  deleteAfterUse: z.boolean().optional(),
  theme: z.enum(['aurora', 'mono', 'tropical']).optional()
}).strict()

// Settings store
const store = new Store<{ settings: UserSettings }>({
  defaults: {
    settings: {
      language: 'en',
      deleteAfterUse: false,
      theme: 'tropical'
    }
  }
})

let isScanning = false
let scanAbortController: AbortController | null = null

// Validate and escape paths for batch files
const validateBatchPath = (path: string): void => {
  // Reject control characters that could inject commands (\r\n, \x00, etc.)
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) {
      throw new Error('Path contains invalid control characters')
    }
  }
  // Ensure path is an absolute Windows path
  if (!/^[A-Z]:\\/i.test(path)) {
    throw new Error('Path must be an absolute Windows path')
  }
}

const escapeBatchPath = (path: string): string => {
  validateBatchPath(path)
  return path
    .replace(/\^/g, '^^')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|')
    .replace(/</g, '^<')
    .replace(/>/g, '^>')
    .replace(/"/g, '""')
    .replace(/%/g, '%%')
}

/**
 * Creates and launches a cleanup batch file that deletes the exe after app closes.
 * Used by both "delete now" and "delete after use" features.
 */
export function createCleanupBatch(exePath: string): void {
  const escapedPath = escapeBatchPath(exePath)

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
  const batchPath = join(app.getPath('temp'), 'custos_cleanup.bat')
  writeFileSync(batchPath, batchContent, 'utf8')

  exec(`start "" "${batchPath}"`, { windowsHide: true }, (err) => {
    if (err) {
      logger.error('Failed to start cleanup batch:', err)
    }
  })
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  const scannerFactory = getScannerFactory()

  // Safe send to renderer (check if window is destroyed)
  const safeSend = (channel: string, data: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // Get scanner info — only scanners that can actually run on this OS
  ipcMain.handle(IPC_CHANNELS.GET_SCANNERS, (): ScannerInfo[] => {
    return getScannerCapabilities()
      .filter((c) => c.supported)
      .map(({ id, name, description }) => ({ id, name, description }))
  })

  // Get full capability matrix across every app area (supported + unsupported,
  // with reasons), grouped by category.
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_CAPABILITIES, (): ScannerCapability[] => {
    return getAllCapabilities()
  })

  // Timeout wrapper for scanner - adaptive based on Windows version
  const SCANNER_TIMEOUT_MS = Math.round(30000 * getTimeoutMultiplier())

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
    const executing = new Set<Promise<void>>()

    for (const scanner of scanners) {
      if (scanAbortController?.signal.aborted) break

      const scanPromise = (async () => {
        // Capture index before await to avoid race condition with concurrent scanners
        const localIndex = ++completedRef.count

        // Send progress update for starting scanner
        safeSend(IPC_CHANNELS.SCAN_PROGRESS, {
          scannerName: scanner.name,
          currentItem: localIndex,
          totalItems: totalScanners,
          currentPath: `Starting ${scanner.name}...`,
          percentage: ((localIndex - 1) / totalScanners) * 100
        } as ScanProgress)

        const result = await runScannerWithTimeout(scanner, {
          onProgress: (progress: ScanProgress) => {
            throttledProgress.emit(progress, (p) => safeSend(IPC_CHANNELS.SCAN_PROGRESS, p))
          }
        })

        results.push(result)

        // Send individual result
        safeSend(IPC_CHANNELS.SCAN_RESULT, result)
      })()

      // Self-removing: promise removes itself from the set when it settles
      const tracked = scanPromise.then(
        () => { executing.delete(tracked) },
        () => { executing.delete(tracked) }
      )
      executing.add(tracked)

      // Limit concurrency — wait for any promise to settle before adding more
      if (executing.size >= concurrency) {
        await Promise.race(executing)
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

    // Only run scanners supported on the current OS — unsupported ones are skipped
    const supportedIds = new Set(getSupportedScannerIds())
    const requestedIds: ScannerName[] = scannerIds
      ? scannerIds
      : (scannerFactory.getScannerInfo().map(i => i.id) as ScannerName[])

    const allScanners = requestedIds
      .filter(id => supportedIds.has(id))
      .map(id => scannerFactory.getScanner(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)

    if (allScanners.length === 0) {
      logger.warn('No scanners are supported on this OS', { os: getOsInfo().displayName })
    }

    // Group scanners by type for optimal parallel execution
    const scannerNameMap = new Map<BaseScanner, string>()
    allScanners.forEach(s => scannerNameMap.set(s, s.name.toLowerCase()))

    // Group A: File system scanners (can run all in parallel)
    const groupANames = ['appdata', 'prefetch', 'recent', 'game', 'steam']
    const groupA = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupANames.some(n => name.includes(n))
    })

    // Group B: Registry/PowerShell/system command scanners (run in parallel with limit)
    const groupBNames = ['registry', 'bam', 'shellbag', 'amcache', 'scheduled task']
    const groupB = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupBNames.some(n => name.includes(n))
    })

    // Group C: Independent scanners (process, browser, dns cache)
    const groupCNames = ['process', 'browser', 'dns cache']
    const groupC = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupCNames.some(n => name.includes(n))
    })

    // Group D: VM detection scanner (runs independently)
    const groupDNames = ['vm']
    const groupD = allScanners.filter(s => {
      const name = scannerNameMap.get(s) || ''
      return groupDNames.some(n => name.includes(n))
    })

    const throttledProgress = new ThrottledProgress(100)
    const completedRef = { count: 0 }
    const totalScanners = allScanners.length

    try {
      // Run all groups in parallel
      const [resultsA, resultsB, resultsC, resultsD] = await Promise.all([
        runScannerGroup(groupA, 5, throttledProgress, completedRef, totalScanners),
        runScannerGroup(groupB, 4, throttledProgress, completedRef, totalScanners),
        runScannerGroup(groupC, 2, throttledProgress, completedRef, totalScanners),
        runScannerGroup(groupD, 1, throttledProgress, completedRef, totalScanners)
      ])

      const results = [...resultsA, ...resultsB, ...resultsC, ...resultsD]

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

  // Set settings (validated with Zod to reject unknown properties)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings: Partial<UserSettings>): UserSettings => {
    const parsed = UserSettingsPartialSchema.safeParse(settings)
    if (!parsed.success) {
      throw new Error(`Invalid settings: ${parsed.error.message}`)
    }
    const current = store.get('settings')
    const updated = { ...current, ...parsed.data }
    store.set('settings', updated)
    return updated
  })

  // Get cross-platform OS info (auto-detected: Windows / macOS / Linux)
  const osInfoHandler = async (): Promise<OsInfo> => getOsInfo()
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_OS_INFO, osInfoHandler)
  // Backward-compatible channel kept for safety
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_WINDOWS_VERSION, osInfoHandler)

  // Get app version
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, (): string => {
    return app.getVersion()
  })

  // Open external URL - fire and forget for speed
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_event, url: string): void => {
    shell.openExternal(url).catch(err =>
      logger.warn('Failed to open external URL', { url, error: err instanceof Error ? err.message : String(err) })
    )
  })

  // Open path in explorer - fire and forget for speed
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_PATH, (_event, path: string): void => {
    // Expand environment variables first
    const expandedPath = path.replace(/%([^%]+)%/g, (_, varName) => {
      return process.env[varName] || ''
    })

    // Handle special URI schemes AFTER expansion (ms-settings, windowsdefender, etc.)
    if (expandedPath.includes(':') && !expandedPath.match(/^[A-Z]:\\/i)) {
      shell.openExternal(expandedPath).catch(err =>
        logger.warn('Failed to open external path', { path: expandedPath, error: err instanceof Error ? err.message : String(err) })
      )
      return
    }

    shell.openPath(expandedPath).catch(err =>
      logger.warn('Failed to open path', { path: expandedPath, error: err instanceof Error ? err.message : String(err) })
    )
  })

  // Open registry key - optimized for speed
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_REGISTRY, (_event, keyPath: string): { success: boolean; error?: string } => {

    // Validate keyPath
    if (!keyPath || !/^[A-Za-z0-9\\_\-\s.(){}]+$/.test(keyPath)) {
      return { success: false, error: 'Invalid registry key path' }
    }

    // Expand HKCU to full form
    const expandedKeyPath = keyPath
      .replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\')
      .replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\')
      .replace(/^HKU\\/i, 'HKEY_USERS\\')
      .replace(/^HKCR\\/i, 'HKEY_CLASSES_ROOT\\')
      .replace(/^HKCC\\/i, 'HKEY_CURRENT_CONFIG\\')

    // Fire and forget - write LastKey and start regedit without waiting
    // Step 1: Write LastKey (async, don't wait)
    execFile('reg', [
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit',
      '/v', 'LastKey',
      '/t', 'REG_SZ',
      '/d', expandedKeyPath,
      '/f'
    ], () => {
      // Step 2: Start regedit after LastKey is written (minimal delay)
      setTimeout(() => {
        execFile('regedit.exe', () => {})
      }, 50)
    })

    return { success: true }
  })

  // Delete self (for "delete after use" feature)
  ipcMain.handle(IPC_CHANNELS.APP_DELETE_SELF, async (): Promise<void> => {
    createCleanupBatch(app.getPath('exe'))
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
