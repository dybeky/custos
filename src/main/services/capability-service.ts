import { CapabilityCategory, OsPlatform, ScannerCapability } from '../../shared/types'
import { getOsInfo } from '../utils/os-utils'
import { getScannerFactory } from '../scanners'

/**
 * Declarative requirement for a scanner.
 * `platforms` lists the operating systems where the scanner can run at all.
 * `minWindowsBuild` optionally gates a scanner behind a minimum Windows build.
 * `requirement` is the short human-readable label shown in the UI.
 */
interface Requirement {
  platforms: OsPlatform[]
  minWindowsBuild?: number
  requirement: string
}

// Every current scanner relies on Windows forensic artifacts
// (registry, prefetch, BAM, tasklist, amcache, shellbags, schtasks…).
const DEFAULT_REQUIREMENT: Requirement = {
  platforms: ['windows'],
  requirement: 'Windows'
}

const REQUIREMENTS: Record<string, Requirement> = {
  appdata: { platforms: ['windows'], requirement: 'Windows' },
  prefetch: { platforms: ['windows'], requirement: 'Windows' },
  recentfiles: { platforms: ['windows'], requirement: 'Windows' },
  gamefolder: { platforms: ['windows'], requirement: 'Windows' },
  registry: { platforms: ['windows'], requirement: 'Windows' },
  browserhistory: { platforms: ['windows'], requirement: 'Windows' },
  process: { platforms: ['windows'], requirement: 'Windows' },
  steam: { platforms: ['windows'], requirement: 'Windows' },
  amcache: { platforms: ['windows'], requirement: 'Windows' },
  // BAM (Background Activity Moderator) arrived in Windows 10 1709 (build 16299)
  bam: { platforms: ['windows'], minWindowsBuild: 16299, requirement: 'Windows 10 1709+' },
  shellbags: { platforms: ['windows'], requirement: 'Windows' },
  vm: { platforms: ['windows'], requirement: 'Windows' },
  dnscache: { platforms: ['windows'], requirement: 'Windows' },
  scheduledtasks: { platforms: ['windows'], requirement: 'Windows' }
}

/**
 * Compute, for every scanner, whether it is usable on the current OS and why not.
 * This is the single source of truth for both the dashboard display and scan gating.
 */
export function getScannerCapabilities(): ScannerCapability[] {
  const os = getOsInfo()
  const factory = getScannerFactory()

  return factory.getScannerInfo().map((info) => {
    const req = REQUIREMENTS[info.id] ?? DEFAULT_REQUIREMENT
    return resolveCapability(
      { id: info.id, name: info.name, description: info.description, category: 'scan' },
      req,
      os
    )
  })
}

/** Ids of scanners that can actually run on the current OS. */
export function getSupportedScannerIds(): string[] {
  return getScannerCapabilities()
    .filter((c) => c.supported)
    .map((c) => c.id)
}

/**
 * Non-scanner features, grouped by the tab they belong to. These cover the
 * rest of the app so the System Compatibility card reflects every area, not
 * just the scanners on the Scan tab.
 */
interface FeatureDef {
  id: string
  name: string
  description: string
  category: CapabilityCategory
  req: Requirement
}

// External Windows forensic tools surfaced on the Utilities tab. They are
// native Windows executables, so they only "work" on a Windows host.
const WINDOWS_TOOL: Requirement = { platforms: ['windows'], requirement: 'Windows' }

// Cross-platform features run anywhere Custos itself runs.
const ANY_OS: Requirement = {
  platforms: ['windows', 'macos', 'linux', 'unknown'],
  requirement: 'Any system'
}

const FEATURES: FeatureDef[] = [
  // Manual tab — operator-driven shortcuts
  { id: 'manual-shortcuts', name: 'Folder & settings shortcuts', description: 'Open Windows folders and settings pages', category: 'manual', req: WINDOWS_TOOL },
  { id: 'manual-registry', name: 'Registry shortcuts', description: 'Jump to forensic registry keys in regedit', category: 'manual', req: WINDOWS_TOOL },
  { id: 'manual-links', name: 'Reference links', description: 'Open Telegram and marketplace reference links', category: 'manual', req: ANY_OS },

  // Utilities tab — external tools
  { id: 'tool-lastactivityview', name: 'LastActivityView', description: 'Computer activity log viewer', category: 'utilities', req: WINDOWS_TOOL },
  { id: 'tool-usbdeview', name: 'USBDeview', description: 'Connected USB device history', category: 'utilities', req: WINDOWS_TOOL },
  { id: 'tool-everything', name: 'Everything', description: 'Instant file-name search', category: 'utilities', req: WINDOWS_TOOL },
  { id: 'tool-systeminformer', name: 'System Informer', description: 'Advanced process viewer', category: 'utilities', req: WINDOWS_TOOL },
  { id: 'tool-shellbaganalyzer', name: 'ShellBag Analyzer', description: 'ShellBag inspection & cleanup', category: 'utilities', req: WINDOWS_TOOL },

  // Results tab — exporting findings
  { id: 'export-csv', name: 'CSV export', description: 'Export scan results as CSV', category: 'export', req: ANY_OS },
  { id: 'export-json', name: 'JSON export', description: 'Export scan results as JSON', category: 'export', req: ANY_OS }
]

function getFeatureCapabilities(): ScannerCapability[] {
  const os = getOsInfo()
  return FEATURES.map((f) =>
    resolveCapability({ id: f.id, name: f.name, description: f.description, category: f.category }, f.req, os)
  )
}

/**
 * Full capability matrix across every app area (scanners + other tabs),
 * grouped by category. Drives the System Compatibility card on the dashboard.
 */
export function getAllCapabilities(): ScannerCapability[] {
  return [...getScannerCapabilities(), ...getFeatureCapabilities()]
}

/** Shared resolution of a single capability against the current OS. */
function resolveCapability(
  base: Pick<ScannerCapability, 'id' | 'name' | 'description' | 'category'>,
  req: Requirement,
  os: ReturnType<typeof getOsInfo>
): ScannerCapability {
  let supported = req.platforms.includes(os.platform)
  let reason: string | undefined

  if (!supported) {
    reason = `Not available on ${os.name} — requires ${req.requirement}`
  } else if (req.minWindowsBuild && os.platform === 'windows' && os.build < req.minWindowsBuild) {
    supported = false
    reason = `Requires ${req.requirement} (build ${req.minWindowsBuild}+)`
  }

  return { ...base, supported, requirement: req.requirement, reason }
}
