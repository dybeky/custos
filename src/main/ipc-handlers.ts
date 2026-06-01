import { ipcMain, shell, app, BrowserWindow } from 'electron'
import { IPC_CHANNELS, ScanResult, UserSettings, ScannerInfo, OsInfo, ScannerCapability } from '../shared/types'
import { logger } from './services/logger'
import { execFile } from 'child_process'
import { getScannerFactory, ScannerName } from './scanners'
import { getOsInfo, getTimeoutMultiplier } from './utils/os-utils'
import { getScannerCapabilities, getSupportedScannerIds, getAllCapabilities } from './services/capability-service'
import { runScan } from './scan-orchestrator'
import { scheduleSelfDestruct } from './services/self-destruct'
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

  // Timeout per scanner — adaptive based on Windows version
  const SCANNER_TIMEOUT_MS = Math.round(30000 * getTimeoutMultiplier())

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
    const supportedIds = new Set(getSupportedScannerIds()) as Set<ScannerName>
    const requestedIds: ScannerName[] = scannerIds
      ? scannerIds
      : (scannerFactory.getScannerInfo().map(i => i.id) as ScannerName[])

    const supportedCount = requestedIds.filter(id => supportedIds.has(id)).length
    if (supportedCount === 0) {
      logger.warn('No scanners are supported on this OS', { os: getOsInfo().displayName })
    }

    try {
      const results = await runScan({
        factory: scannerFactory,
        requestedIds,
        supportedIds,
        emit: safeSend,
        signal: scanAbortController.signal,
        timeoutMs: SCANNER_TIMEOUT_MS
      })

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
    scheduleSelfDestruct(app.getPath('exe'))
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
