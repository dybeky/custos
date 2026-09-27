import { ipcMain, app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'fs'
import { IPC_CHANNELS, ScanResult, UserSettings, ScannerInfo, OsInfo, ScannerCapability } from '../shared/types'
import type { ScanReport, TriageSettings } from '../shared/types'
import { logger } from './services/logger'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getScannerFactory, ScannerName } from './scanners'
import { analyze, type AnalyzeContext } from './intel/risk-engine'
import { osMetaFromOsInfo, makeScanId } from './intel/report-context'
import { getOsInfo, getTimeoutMultiplier } from './utils/os-utils'
import { getScannerCapabilities, getSupportedScannerIds, getAllCapabilities } from './services/capability-service'
import { runScan } from './scan-orchestrator'
import { ScanSession } from './scan-session'
import { setupLiveIpcHandlers } from './live-ipc'
import { getRecentCommits } from './services/github-service'
import { humanizeCommits } from './services/changelog'
import { checkForUpdate } from './services/updater'
import { appStore } from './services/app-store'
import { safeOpenExternal, safeOpenPath } from './utils/safe-open'
import { normalizeRevealPath } from './utils/url-policy'
import { AuthLoginPayloadSchema, AuthUploadAvatarPayloadSchema } from './auth/auth-ipc-schema'
import type { AuthService } from './auth/auth-service'
import { GAMES, type GameId } from '../shared/games'
import type { AuthState } from '../shared/types'
import { z } from 'zod'

const execFileP = promisify(execFile)

// Strict schema for partial user settings — rejects unknown properties
const UserSettingsPartialSchema = z.object({
  uiMode: z.enum(['classic', 'modern']).optional()
}).strict()

/**
 * Normalize persisted settings: drop legacy keys (`theme`, and `language` from
 * when the app shipped a Russian UI) and any other extras, so an old blob
 * still validates against the strict partial schema on the next SETTINGS_SET.
 * Returns a valid UserSettings, defaulting uiMode to 'classic'.
 */
export function migrateSettings(raw: unknown): UserSettings {
  const obj = raw && typeof raw === 'object' ? (raw as { uiMode?: unknown }) : {}
  return {
    uiMode: obj.uiMode === 'modern' ? 'modern' : 'classic'
  }
}

// Single owner of the in-flight scan's running flag + abort controller, kept in
// sync so cancellation can't prematurely free the guard and let a second scan
// start over the still-running one (see ScanSession).
const scanSession = new ScanSession()

// Raw results + analysis context of the most recent scan, kept so triage
// (dismiss / whitelist) can re-score it without rescanning.
let lastScan: { results: ScanResult[]; context: Omit<AnalyzeContext, 'suppression'> } | null = null

const SuppressionSchema = z.object({
  whitelistedSignatures: z.array(z.string().max(200)).max(500),
  dismissedFindingIds: z.array(z.string().regex(/^[0-9a-f]{16}$/)).max(10_000)
}).strict()

/** Persisted triage settings, tolerant of a missing or malformed store entry. */
function loadTriage(): TriageSettings {
  const raw = appStore.get('triage') as Partial<TriageSettings> | undefined
  const list = Array.isArray(raw?.whitelistedSignatures) ? raw.whitelistedSignatures : []
  return { whitelistedSignatures: list.filter((s): s is string => typeof s === 'string') }
}


export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // Register live-scan IPC handlers
  setupLiveIpcHandlers(mainWindow)

  ipcMain.handle(IPC_CHANNELS.GITHUB_GET_CHANGELOG, async () => {
    const commits = await getRecentCommits(30)
    return humanizeCommits(commits)
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => checkForUpdate())

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

  // Static for Phase 1; the signature-service supplies a real version in a later phase.
  const SIGNATURE_VERSION = 'bundled-1'

  // Start scan
  ipcMain.handle(IPC_CHANNELS.SCAN_START, async (_event, scannerIds?: ScannerName[], gameId?: GameId): Promise<ScanResult[]> => {
    // Runtime shape validation — TypeScript types are erased at the IPC boundary.
    if (scannerIds !== undefined && (!Array.isArray(scannerIds) || scannerIds.some(id => typeof id !== 'string'))) {
      throw new Error('Invalid scannerIds: expected an array of strings')
    }
    if (gameId !== undefined && gameId !== null && !Object.hasOwn(GAMES, gameId)) {
      throw new Error('Invalid gameId')
    }
    if (scanSession.isScanning) {
      logger.warn('Scan already in progress')
      throw new Error('Scan already in progress')
    }

    logger.info('Scan started', { scannerIds: scannerIds || 'all' })
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

    // The session stays "in progress" until runScan settles — even after a
    // SCAN_CANCEL — so a second SCAN_START can't interleave and clobber state.
    const scanStartedAt = Date.now()
    try {
      return await scanSession.run(async (signal) => {
        const results = await runScan({
          factory: scannerFactory,
          requestedIds,
          supportedIds,
          emit: safeSend,
          signal,
          timeoutMs: SCANNER_TIMEOUT_MS
        })

        const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
        logger.info('Scan completed', {
          totalScanners: results.length,
          totalFindings,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        })

        const context: Omit<AnalyzeContext, 'suppression'> = {
          scanId: makeScanId(scanStartedAt),
          scannedAt: new Date(scanStartedAt).toISOString(),
          durationMs: Date.now() - scanStartedAt,
          appVersion: app.getVersion(),
          signatureVersion: SIGNATURE_VERSION,
          gameId: gameId ?? null,
          os: osMetaFromOsInfo(getOsInfo()),
          findKeyword: (value: string) => scannerFactory.getKeywordMatcher().findKeyword(value)
        }
        lastScan = { results, context }
        const report = analyze(results, {
          ...context,
          suppression: { whitelistedSignatures: loadTriage().whitelistedSignatures, dismissedFindingIds: [] }
        })
        safeSend(IPC_CHANNELS.SCAN_REPORT, report)
        safeSend(IPC_CHANNELS.SCAN_COMPLETE, results)
        return results
      })
    } catch (error) {
      logger.error('Scan failed', error instanceof Error ? error : new Error(String(error)))
      safeSend(IPC_CHANNELS.SCAN_ERROR, {
        message: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  })

  // Persisted triage (signature whitelist) for the renderer to display/edit.
  ipcMain.handle(IPC_CHANNELS.TRIAGE_GET, (): TriageSettings => loadTriage())

  // Re-score the last scan after the checker dismissed a finding or changed
  // the whitelist. Pure re-analysis of the kept results — nothing is rescanned.
  // The whitelist is persisted for future scans; dismissals are per-scan.
  ipcMain.handle(IPC_CHANNELS.SCAN_REANALYZE, (_event, payload: unknown): ScanReport | null => {
    const parsed = SuppressionSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid triage payload: ${parsed.error.message}`)
    const whitelistedSignatures = [...new Set(parsed.data.whitelistedSignatures.map(s => s.trim()).filter(Boolean))]
    appStore.set('triage', { whitelistedSignatures })
    if (!lastScan) return null
    return analyze(lastScan.results, {
      ...lastScan.context,
      suppression: { whitelistedSignatures, dismissedFindingIds: parsed.data.dismissedFindingIds }
    })
  })

  // Cancel scan
  ipcMain.handle(IPC_CHANNELS.SCAN_CANCEL, async (): Promise<void> => {
    // Abort + cooperatively cancel, but do NOT clear the running flag here: the
    // in-flight runScan owns that and clears it in its finally once the
    // already-started scanners actually unwind. Clearing it now would let an
    // immediate SCAN_START run concurrently over the shared scanner instances.
    scanSession.cancel()
    scannerFactory.cancelAll()
  })

  // Get settings — migrate persisted data on read so a legacy `{ language, theme }`
  // blob is normalized (theme stripped) and re-persisted, keeping it valid for the
  // strict partial schema on the next SETTINGS_SET.
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): UserSettings => {
    const migrated = migrateSettings(appStore.get('settings'))
    appStore.set('settings', migrated)
    return migrated
  })

  // Set settings (validated with Zod to reject unknown properties)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings: Partial<UserSettings>): UserSettings => {
    const parsed = UserSettingsPartialSchema.safeParse(settings)
    if (!parsed.success) {
      throw new Error(`Invalid settings: ${parsed.error.message}`)
    }
    // Normalize the persisted blob first so legacy keys (e.g. `theme`) are
    // never spread back into the store alongside the update.
    const current = migrateSettings(appStore.get('settings'))
    const updated: UserSettings = { ...current, ...parsed.data }
    appStore.set('settings', updated)
    return updated
  })

  // Get cross-platform OS info (auto-detected: Windows / macOS / Linux)
  ipcMain.handle(IPC_CHANNELS.SYSTEM_GET_OS_INFO, (): OsInfo => getOsInfo())

  // Get app version
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, (): string => {
    return app.getVersion()
  })

  // Open external URL - validated against the scheme allowlist
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_event, url: string): void => {
    safeOpenExternal(url)
  })

  // Open path in explorer - validated; %ENV% expansion + scheme routing live in safeOpenPath
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_PATH, (_event, path: string): void => {
    safeOpenPath(path)
  })

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_REGISTRY, async (_event, keyPath: string): Promise<{ success: boolean; error?: string }> => {
    // Validate keyPath. Reject leading/trailing backslashes — a path must be a
    // hive root followed by backslash-separated segments, never an empty segment.
    if (!keyPath || !/^[A-Za-z0-9\\_\-\s.(){}]+$/.test(keyPath) || keyPath.startsWith('\\') || keyPath.endsWith('\\')) {
      return { success: false, error: 'Invalid registry key path' }
    }

    const expandedKeyPath = keyPath
      .replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\')
      .replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\')
      .replace(/^HKU\\/i, 'HKEY_USERS\\')
      .replace(/^HKCR\\/i, 'HKEY_CLASSES_ROOT\\')
      .replace(/^HKCC\\/i, 'HKEY_CURRENT_CONFIG\\')

    try {
      // Point regedit's "last opened key" at the target, then launch it.
      await execFileP('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit',
        '/v', 'LastKey',
        '/t', 'REG_SZ',
        '/d', expandedKeyPath,
        '/f'
      ], { timeout: 5000, windowsHide: true })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.debug('Failed to write regedit LastKey', { error: msg })
      return { success: false, error: 'Could not prepare regedit' }
    }

    // regedit stays open until the user closes it, so only spawn errors are
    // observable — report those, otherwise assume the launch succeeded.
    execFile('regedit.exe', (launchError) => {
      if (launchError) {
        logger.debug('Failed to launch regedit', { error: launchError.message })
      }
    })
    return { success: true }
  })

  // Show a finding's file/folder selected in Explorer. showItemInFolder only
  // reveals — it never opens or executes the target — so, unlike openPath,
  // this is safe even for .exe/.dll findings. Still limited to plain local
  // absolute paths that exist.
  ipcMain.handle(IPC_CHANNELS.APP_REVEAL_PATH, (_event, rawPath: unknown): boolean => {
    const path = typeof rawPath === 'string' ? normalizeRevealPath(rawPath) : null
    if (!path || !existsSync(path)) return false
    shell.showItemInFolder(path)
    return true
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

/**
 * Register the request/response auth IPC handlers, wired to the AuthService.
 * The renderer never sees the bearer token, PKCE verifier, or grant — only the
 * public AuthState. The `auth:changed` push is wired separately in index.ts via
 * the AuthService `onChange` callback (kept beside construction so a single
 * import in index.ts wires both the handlers and the push).
 */
export function setupAuthHandlers(_mainWindow: BrowserWindow, authService: AuthService): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, (): AuthState => authService.getState())

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, payload: unknown): Promise<void> => {
    // TypeScript types are erased at the IPC boundary — validate the shape here.
    const parsed = AuthLoginPayloadSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid login payload: ${parsed.error.message}`)
    await authService.login(parsed.data.provider)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CANCEL, async (): Promise<void> => authService.cancel())
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<void> => authService.logout())
  // Open the current user's profile on the web. Main builds the canonical
  // /profile/id/<id> URL (allowlisted by isAllowedAuthUrl) — the renderer never
  // constructs a 97437.dev URL itself.
  ipcMain.handle(IPC_CHANNELS.AUTH_OPEN_PROFILE, (): void => authService.openProfile())

  // Change the avatar. The renderer sends the cropped image bytes; main holds the
  // bearer and does the upload. Validate the shape at the boundary (types erased).
  ipcMain.handle(
    IPC_CHANNELS.AUTH_UPLOAD_AVATAR,
    async (_e, payload: unknown): Promise<{ ok: boolean; error?: string }> => {
      const parsed = AuthUploadAvatarPayloadSchema.safeParse(payload)
      if (!parsed.success) return { ok: false, error: 'invalid_payload' }
      return authService.uploadAvatar(parsed.data.bytes, parsed.data.mime)
    }
  )
}
