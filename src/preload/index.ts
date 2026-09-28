import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, ScannerInfo, OsInfo, ScannerCapability, ScannerName, LiveFinding, LiveScanStatus, ScanReport } from '../shared/types'
import type { ChangelogGroup, UpdateInfo, UpdateProgress, AuthState, AuthProvider, SuppressionState, TriageSettings, SiteUploadResult, SitePlayerResult, SignatureStatus } from '../shared/types'
import type { GameId } from '../shared/games'
import type { HistoryEntry, HistorySummary } from '../shared/history'

export type AuthChangedCallback = (state: AuthState) => void

export type ScanProgressCallback = (progress: ScanProgress) => void
export type ScanResultCallback = (result: ScanResult) => void
export type ScanCompleteCallback = (results: ScanResult[]) => void
export type ScanErrorCallback = (error: { message: string }) => void
export type ScanReportCallback = (report: ScanReport) => void

// Live-scan callback types
export type LiveScanResultCallback = (finding: LiveFinding) => void
export type LiveScanProgressCallback = (progress: {
  detectorId: string
  detectorName: string
  current: number
  total: number
  percentage: number
}) => void
export type LiveScanCompleteCallback = (findings: LiveFinding[]) => void

const api = {
  // Scanner operations
  getScanners: (): Promise<ScannerInfo[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SCANNERS)
  },

  /** Start a forensic scan. `gameId` is stamped into the report's metadata. */
  startScan: (scannerIds?: ScannerName[], gameId?: GameId): Promise<ScanResult[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, scannerIds, gameId)
  },

  cancelScan: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL)
  },

  /** Re-score the last scan with new triage choices (null if no scan yet). */
  reanalyze: (suppression: SuppressionState): Promise<ScanReport | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_REANALYZE, suppression)
  },

  /** Saved checks, newest first. */
  listHistory: (): Promise<HistorySummary[]> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),

  /** Load one saved check (report + raw results + case). */
  getHistory: (id: string): Promise<HistoryEntry | null> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, id),

  /** Delete a saved check; resolves with the updated list. */
  deleteHistory: (id: string): Promise<HistorySummary[]> => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),

  /** Attach player + notes to a saved check; resolves with the updated list. */
  setHistoryCase: (id: string, player: string, notes: string): Promise<HistorySummary[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_SET_CASE, { id, player, notes }),

  /** Persisted triage settings (the signature whitelist). */
  getTriage: (): Promise<TriageSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TRIAGE_GET)
  },

  // Scan event listeners
  onScanProgress: (callback: ScanProgressCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_PROGRESS, listener)
  },

  onScanResult: (callback: ScanResultCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: ScanResult): void => {
      callback(result)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_RESULT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_RESULT, listener)
  },

  onScanComplete: (callback: ScanCompleteCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, results: ScanResult[]): void => {
      callback(results)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_COMPLETE, listener)
  },

  onScanReport: (callback: ScanReportCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, report: ScanReport): void => {
      callback(report)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_REPORT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_REPORT, listener)
  },

  onScanError: (callback: ScanErrorCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: { message: string }): void => {
      callback(error)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_ERROR, listener)
  },

  // Settings
  getSettings: (): Promise<UserSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET)
  },

  setSettings: (settings: Partial<UserSettings>): Promise<UserSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings)
  },

  // System info (cross-platform OS detection)
  getOsInfo: (): Promise<OsInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_OS_INFO)
  },

  // Per-scanner capabilities for the current OS
  getCapabilities: (): Promise<ScannerCapability[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_CAPABILITIES)
  },

  // App operations
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION)
  },

  openExternal: (url: string): void => {
    ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL, url).catch(() => {})
  },

  openPath: (path: string): void => {
    ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_PATH, path).catch(() => {})
  },

  /** Open a game folder found through Steam's libraries ('' = Steam itself). Resolves false if not found. */
  openSteamFolder: (game: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_STEAM_FOLDER, game).catch(() => false),

  /** Select a file/folder in Explorer (never opens it). Resolves false if it no longer exists. */
  revealPath: (path: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_REVEAL_PATH, path)
  },

  openRegistry: (keyPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_REGISTRY, keyPath)
  },

  quit: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT)
  },

  // Window controls
  minimize: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE)
  },

  maximize: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE)
  },

  close: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE)
  },

  // ── Live scan ────────────────────────────────────────────────────────────

  /** Get the current live-scan capability status (platform, native, game). */
  getLiveStatus: (gameId?: GameId): Promise<LiveScanStatus> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIVE_GET_STATUS, gameId)
  },

  /** Start a live scan. Streams results via onLiveScanResult; returns all findings when done. */
  startLiveScan: (gameId?: GameId): Promise<LiveFinding[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIVE_SCAN_START, gameId)
  },

  /** Cancel the running live scan (stops before the next detector). */
  cancelLiveScan: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIVE_SCAN_CANCEL)
  },

  /** Subscribe to per-detector progress events during a live scan. Returns unsubscribe fn. */
  onLiveScanProgress: (callback: LiveScanProgressCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<LiveScanProgressCallback>[0]): void => {
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.LIVE_SCAN_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LIVE_SCAN_PROGRESS, listener)
  },

  /** Subscribe to individual findings as they arrive. Returns unsubscribe fn. */
  onLiveScanResult: (callback: LiveScanResultCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, finding: LiveFinding): void => {
      callback(finding)
    }
    ipcRenderer.on(IPC_CHANNELS.LIVE_SCAN_RESULT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LIVE_SCAN_RESULT, listener)
  },

  /** Subscribe to the scan-complete event (all findings). Returns unsubscribe fn. */
  onLiveScanComplete: (callback: LiveScanCompleteCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, findings: LiveFinding[]): void => {
      callback(findings)
    }
    ipcRenderer.on(IPC_CHANNELS.LIVE_SCAN_COMPLETE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LIVE_SCAN_COMPLETE, listener)
  },

  /** Fetch the humanized changelog from GitHub commits. */
  getChangelog: (): Promise<ChangelogGroup[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_GET_CHANGELOG),

  /** Check for a newer release on GitHub. */
  checkForUpdate: (): Promise<UpdateInfo> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

  /** Download + verify the release from the last check and restart into it. */
  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),

  onUpdateProgress: (callback: (p: UpdateProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, p: UpdateProgress): void => callback(p)
    ipcRenderer.on(IPC_CHANNELS.UPDATE_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_PROGRESS, listener)
  },

  // ── Auth (token-free; all networking + the bearer token live in main) ──────
  /** Current public auth state (never exposes the token/grant/codeVerifier). */
  getAuthState: (): Promise<AuthState> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),

  /** Start an interactive (google/github) or device-code login. */
  login: (provider: AuthProvider): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, { provider }),

  /** Cancel an in-flight login. */
  cancelLogin: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CANCEL),

  /** Log out — wipes the local token and best-effort revokes server-side. */
  logout: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),

  /** Open the signed-in user's profile on the web (main builds the allowlisted URL). */
  openProfile: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_OPEN_PROFILE),

  /** Change the profile picture. `bytes` is a cropped image (webp); main holds the
   *  bearer and performs the upload, then re-emits auth state with the new avatar. */
  uploadAvatar: (bytes: ArrayBuffer, mime: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_UPLOAD_AVATAR, { bytes, mime }),

  /** Upload a saved check to the site (main loads it from history by id). */
  uploadCheckToSite: (historyId: string, player: string, notes: string): Promise<SiteUploadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITE_UPLOAD_CHECK, { historyId, player, notes }),

  /** Checks of this player uploaded to the site by any checker. */
  getSitePlayerChecks: (player: string): Promise<SitePlayerResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITE_PLAYER_CHECKS, { player }),

  /** Open a site check (`{ checkId }`) or player card (`{ player }`); main builds the URL. */
  openOnSite: (target: { checkId: string } | { player: string }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITE_OPEN, target),

  /** State of the detection signatures downloaded from the site. */
  getSignatureStatus: (): Promise<SignatureStatus> => ipcRenderer.invoke(IPC_CHANNELS.SIGNATURES_STATUS),

  /** Check the site for newer signatures now. */
  checkSignatures: (): Promise<SignatureStatus> => ipcRenderer.invoke(IPC_CHANNELS.SIGNATURES_CHECK),

  /** Subscribe to auth-state changes pushed from main. Returns unsubscribe fn. */
  onAuthChanged: (callback: AuthChangedCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AuthState): void => callback(state)
    ipcRenderer.on(IPC_CHANNELS.AUTH_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_CHANGED, listener)
  }
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for renderer
export type ElectronAPI = typeof api
