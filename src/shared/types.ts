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
  | 'filehash'
  | 'windowmodule'

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

// ── Live-scan types ──────────────────────────────────────────────────────────

/** Confidence level for a live-scan finding. */
export type LiveFindingConfidence = 'high' | 'suspicious' | 'info'

/** A single finding produced by a live detector. */
export interface LiveFinding {
  /** Stable identifier of the detector that produced this finding. */
  detectorId: string
  /** Human-readable detector name. */
  detectorName: string
  /** Short title for the UI. */
  title: string
  /** Full description / evidence. */
  detail: string
  /** Confidence level — drives colour coding in the renderer. */
  confidence: LiveFindingConfidence
}

/** Status object returned by LIVE_GET_STATUS. */
export interface LiveScanStatus {
  /** True when memoryjs loaded successfully (Windows + correct Electron ABI). */
  nativeAvailable: boolean
  /** process.platform value from the main process. */
  platform: string
  /** True when the Unturned game process was found running. */
  gameRunning: boolean
  /** Name of the game process if found (e.g. "Unturned.exe"). */
  gameName?: string
}

/**
 * Context passed to every live detector at run-time.
 * Detectors must NOT open or close the handle — that is managed by the
 * orchestrator.
 */
export interface LiveContext {
  /** PID of the located game process. */
  pid: number
  /** OS process handle (from memoryjs openProcess). */
  handle: number
  /** Executable name (e.g. "Unturned.exe"). */
  gameName: string
  /** Loaded signatures / module allow-deny lists. */
  signatures: {
    moduleAllowlist: string[]
    moduleDenylist: string[]
    aob: Array<{ name: string; pattern: string; module?: string }>
  }
}

// Changelog types (shared between main-process humanizer and renderer Dashboard)
export interface ChangelogItem { text: string; sha: string; date: string }
export interface ChangelogGroup { group: string; entries: ChangelogItem[] }

// Update-check result returned by the UPDATE_CHECK IPC channel
export interface UpdateInfo {
  updateAvailable: boolean
  /** True when the update check could not complete (network/rate-limit), as opposed to confirmed up-to-date. */
  checkFailed: boolean
  currentVersion: string
  latestVersion: string | null
  url: string | null
  notes: ChangelogGroup[]
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
  GITHUB_GET_CHANGELOG: 'github:changelog',
  UPDATE_CHECK: 'update:check',
  APP_VERSION: 'app:version',
  APP_OPEN_EXTERNAL: 'app:open-external',
  APP_OPEN_PATH: 'app:open-path',
  APP_OPEN_REGISTRY: 'app:open-registry',
  APP_DELETE_SELF: 'app:delete-self',
  APP_QUIT: 'app:quit',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Live-scan operations
  LIVE_GET_STATUS: 'live:get-status',
  LIVE_SCAN_START: 'live:scan:start',
  LIVE_SCAN_PROGRESS: 'live:scan:progress',
  LIVE_SCAN_RESULT: 'live:scan:result',
  LIVE_SCAN_COMPLETE: 'live:scan:complete'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
