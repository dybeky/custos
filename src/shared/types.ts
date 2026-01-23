// Scan result types
export interface ScanResult {
  scannerName: string
  success: boolean
  findings: string[]
  error?: string
  startTime: Date
  endTime: Date
  duration: number
  count: number
  hasFindings: boolean
}

export interface ScanProgress {
  scannerName: string
  currentItem: number
  totalItems: number
  currentPath?: string
  percentage: number
}

// Scanner metadata
export interface ScannerInfo {
  name: string
  description: string
  enabled: boolean
}

// Settings types
export interface UserSettings {
  language: 'en' | 'ru'
  checkUpdatesOnStartup: boolean
  autoDownloadUpdates: boolean
  deleteAfterUse: boolean
}

// Update types
export interface VersionInfo {
  currentVersion: string
  latestVersion?: string
  releaseDate?: string
  changelog?: string
  downloadUrl?: string
  isUpdateAvailable: boolean
  fileSize?: number
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  speed: number // bytes per second
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Scan operations
  SCAN_START: 'scan:start',
  SCAN_CANCEL: 'scan:cancel',
  SCAN_PROGRESS: 'scan:progress',
  SCAN_RESULT: 'scan:result',
  SCAN_COMPLETE: 'scan:complete',
  SCAN_ERROR: 'scan:error',

  // Scanner info
  GET_SCANNERS: 'scanners:get',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // App operations
  APP_VERSION: 'app:version',
  APP_CHECK_UPDATE: 'app:check-update',
  APP_DOWNLOAD_UPDATE: 'app:download-update',
  APP_DOWNLOAD_PROGRESS: 'app:download-progress',
  APP_OPEN_EXTERNAL: 'app:open-external',
  APP_OPEN_PATH: 'app:open-path',
  APP_DELETE_SELF: 'app:delete-self',
  APP_QUIT: 'app:quit',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
