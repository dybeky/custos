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

// Stable scanner identifiers — the contract shared across main, preload and
// renderer. Lives here (not in src/main) so the renderer/preload can reference
// it without pulling the main-process scanner graph across the process boundary.
export type ScannerName =
  | 'appdata'
  | 'prefetch'
  | 'recentfiles'
  | 'gamefolder'
  | 'registry'
  | 'browserhistory'
  | 'process'
  | 'steam'
  | 'amcache'
  | 'bam'
  | 'shellbags'
  | 'vm'
  | 'dnscache'
  | 'scheduledtasks'

// Scanner metadata
export interface ScannerInfo {
  id: string
  name: string
  description: string
}

// Settings types
export interface UserSettings {
  language: 'en' | 'ru'
  deleteAfterUse: boolean
  theme: 'aurora' | 'mono' | 'tropical'
}

// Cross-platform OS info for renderer
export type OsPlatform = 'windows' | 'macos' | 'linux' | 'unknown'

export interface OsInfo {
  platform: OsPlatform
  major: number
  minor: number
  build: number
  name: string          // "Windows 11" or "macOS"
  edition: string       // "24H2" or "Tahoe"
  version: string       // "11 24H2" or "26.5"
  displayName: string   // UPPERCASE label, e.g. "WINDOWS 11 · 24H2"
  isWindows11: boolean
}

// Backward-compatible alias (renderer previously imported WindowsVersionInfo)
export type WindowsVersionInfo = OsInfo

// Groups capabilities by the app area / tab they belong to.
export type CapabilityCategory = 'scan' | 'manual' | 'utilities' | 'export'

// Per-feature capability for the current OS (drives the dashboard + scan gating)
export interface ScannerCapability {
  id: string
  name: string
  description: string
  supported: boolean
  requirement: string   // human-readable requirement, e.g. "Windows" or "Windows 10 1709+"
  reason?: string        // why it is unavailable on this system
  category: CapabilityCategory  // which app area / tab this check belongs to
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

  // System info
  SYSTEM_GET_WINDOWS_VERSION: 'system:get-windows-version',
  SYSTEM_GET_OS_INFO: 'system:get-os-info',
  SYSTEM_GET_CAPABILITIES: 'system:get-capabilities',

  // App operations
  APP_VERSION: 'app:version',
  APP_OPEN_EXTERNAL: 'app:open-external',
  APP_OPEN_PATH: 'app:open-path',
  APP_OPEN_REGISTRY: 'app:open-registry',
  APP_DELETE_SELF: 'app:delete-self',
  APP_QUIT: 'app:quit',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
