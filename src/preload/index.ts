import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, ScannerInfo, OsInfo, ScannerCapability, ScannerName, LiveFinding, LiveScanStatus, ScanReport } from '../shared/types'
import type { ChangelogGroup, UpdateInfo, AuthState, AuthProvider } from '../shared/types'
import type { GameId } from '../shared/games'

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

  startScan: (scannerIds?: ScannerName[]): Promise<ScanResult[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_START, scannerIds)
  },

  cancelScan: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCAN_CANCEL)
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

  // Deprecated alias kept for backward compatibility
  getWindowsVersion: (): Promise<OsInfo> => {
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
