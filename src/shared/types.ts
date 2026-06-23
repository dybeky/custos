import type { GameId } from './games'

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
  theme: 'aurora' | 'mono' | 'tropical'
}

// Desktop auth providers. 'google'/'github' are interactive OAuth via the
// browser; 'device' is the headless device-code grant. The auth-client's
// buildStartUrl only accepts the interactive ones (Exclude<AuthProvider,'device'>).
export type AuthProvider = 'google' | 'github' | 'device'

// Public, display-only user shape. Safe to cache on disk (NOT secret).
// The bearer token is the only secret and is never part of this shape.
export interface PublicUser {
  id: string
  username: string
  uid: number
  avatarVersion: number
  role: string | null
  status: string
  // The web returns the raw provider avatar URL, or null when the user has no
  // avatar. The auth-client REPLACES this with the canonical, token-free
  // `/api/avatar/<id>?v=<avatarVersion>` endpoint before handing the user to the
  // renderer (see AuthClient.withAvatar), so what the renderer sees is always a
  // string. Optional because the device-poll / cached shapes may omit it.
  image?: string | null
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
  displayName: string   // UPPERCASE label, e.g. "WINDOWS 11 24H2 · 26100 · ARM64"
  isWindows11: boolean
  /** Real OS CPU architecture ('x64' | 'arm64' | 'ia32' | 'unknown'). */
  arch: string
  /** Architecture this Custos binary was built for. */
  appArch: string
  /** True when the app runs under emulation (e.g. x64 build on Windows-on-ARM). */
  isEmulated: boolean
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
  reason?: string        // why it is unavailable on this system (English fallback)
  /** i18n key suffix for `reason` ('platform' | 'build') — renderer translates via capability.<key>. */
  reasonKey?: 'platform' | 'build'
  /** Interpolation params for `reasonKey` (os, requirement, build). */
  reasonParams?: Record<string, string | number>
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
  /**
   * Finding kind for localization — the renderer looks up
   * liveFindings.<i18nKey>.title/.detail with `params`, falling back to the
   * English title/detail above when the key (or a sub-key) is missing.
   */
  i18nKey?: string
  /** Interpolation params for i18nKey (addresses, module names, sizes…). */
  params?: Record<string, string | number>
}

/** Status object returned by LIVE_GET_STATUS. */
export interface LiveScanStatus {
  /** True when memoryjs loaded successfully (Windows + correct Electron ABI). */
  nativeAvailable: boolean
  /** process.platform value from the main process. */
  platform: string
  /** Architecture of this Custos binary (process.arch), for support messaging. */
  arch: string
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
  SCAN_REPORT: 'scan:report',
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

// ── Forensic intelligence model ──────────────────────────────────────────────
// Raw scanner output is EVIDENCE, never an accusation. Only the risk engine
// produces a graded judgement, and even 'critical' means "investigate now".

// Two independent axes: severity = impact-if-real, confidence = certainty-it's-real.
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Confidence = 'high' | 'medium' | 'low'

// Trust level of a known-file-hash signature. Only 'verified' can drive a critical verdict alone.
export type HashTrust = 'verified' | 'community'

export type FindingCategory =
  | 'hash' | 'execution' | 'runtime' | 'persistence'
  | 'file' | 'registry' | 'network' | 'context' | 'environment'

// Explainability primitive: every severity/confidence change carries a reason.
export interface ScoreReason {
  code: string                 // e.g. 'corroboration' | 'verified-hash' | 'lone-match' | 'community-hash-uncorroborated' | 'environment-only'
  direction: 'up' | 'down' | 'neutral'
  text: string                 // English; renderer may localize via code+params later
  signature?: string
  params?: Record<string, string | number>
}

export interface AnalyzedFinding {
  id: string                   // stable: sha1(scannerId + '\n' + value), first 16 hex
  scannerId: ScannerName
  value: string
  category: FindingCategory
  matched: string | null
  hashTrust?: HashTrust
  severity: Severity           // after correlation
  baseSeverity: Severity       // before correlation
  confidence: Confidence       // after correlation
  baseConfidence: Confidence   // before correlation
  correlationId: string | null
  reasons: ScoreReason[]
  dismissed?: boolean
  whitelisted?: boolean
}

export interface Correlation {
  id: string
  signature: string
  categories: FindingCategory[]
  scannerIds: ScannerName[]
  strength: number             // distinct category count
  severity: Severity
  confidence: Confidence
}

export type VerdictBand = 'clean' | 'low' | 'medium' | 'high' | 'critical'

export interface Verdict {
  score: number                // 0–100
  band: VerdictBand
  rationale: string            // one-line summary (English)
  reasons: ScoreReason[]
}

// Triage state — defined now, persisted/surfaced in later phases. The engine
// accepts it from Phase 1 so suppression is honoured immediately.
export interface SuppressionState {
  whitelistedSignatures: string[]
  dismissedFindingIds: string[]
}

export interface ScanReportMeta {
  appVersion: string
  engineVersion: string
  scannedAt: string            // ISO
  durationMs: number
  gameId: GameId | null
  os?: { name: string; version: string; arch: string; appArch: string }
  signatureVersion: string
  caseLabel?: string
  caseNote?: string
}

export interface ScanReport {
  id: string
  meta: ScanReportMeta
  verdict: Verdict
  findings: AnalyzedFinding[]
  correlations: Correlation[]
  scanners: Array<{ id: ScannerName; name: string; success: boolean; error?: string; durationMs: number; count: number }>
  contentHash?: string
}
