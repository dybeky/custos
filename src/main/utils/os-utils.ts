import { release } from 'os'
import { execFileSync } from 'child_process'
import { logger } from '../services/logger'

export type OsPlatform = 'windows' | 'macos' | 'linux' | 'unknown'

/**
 * Rich, cross-platform operating-system information.
 * Detected automatically at runtime and cached for performance.
 */
export interface OsInfo {
  platform: OsPlatform
  major: number
  minor: number
  build: number          // Windows build number / macOS patch level
  name: string           // Marketing family, e.g. "Windows 11" or "macOS"
  edition: string         // Feature update / codename, e.g. "24H2" or "Tahoe"
  version: string         // Human version string, e.g. "11 24H2" or "26.5"
  displayName: string     // UPPERCASE label for the UI, e.g. "WINDOWS 11 · 24H2"
  isWindows11: boolean
}

interface RawVersion {
  major: number
  minor: number
  build: number
}

let cachedOsInfo: OsInfo | null = null
let cachedWindowsVersion: RawVersion | null = null

function detectPlatform(): OsPlatform {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return 'unknown'
  }
}

/**
 * Get Windows version info (major, minor, build).
 * Uses Node.js os.release() which returns "10.0.26200" on Windows.
 * On non-Windows platforms the kernel release is parsed best-effort.
 */
export function getWindowsVersion(): RawVersion {
  if (cachedWindowsVersion) {
    return cachedWindowsVersion
  }

  // os.release() returns "10.0.26200" format on Windows
  const osRelease = release()
  const parts = osRelease.split('.')

  cachedWindowsVersion = {
    major: parseInt(parts[0]) || 10,
    minor: parseInt(parts[1]) || 0,
    build: parseInt(parts[2]) || 0
  }

  return cachedWindowsVersion
}

/**
 * Check if current Windows is Windows 11 (build >= 22000).
 */
export function isWindows11(): boolean {
  if (detectPlatform() !== 'windows') return false
  const version = getWindowsVersion()
  return version.major === 10 && version.build >= 22000
}

/**
 * Get Windows feature-update name (e.g. "24H2", "22H2") from a build number.
 */
export function getWindowsVersionName(build: number): string {
  // Windows 11 versions
  if (build >= 26100) return '24H2'
  if (build >= 22631) return '23H2'
  if (build >= 22621) return '22H2'
  if (build >= 22000) return '21H2'

  // Windows 10 versions
  if (build >= 19045) return '22H2'
  if (build >= 19044) return '21H2'
  if (build >= 19043) return '21H1'
  if (build >= 19042) return '20H2'
  if (build >= 19041) return '2004'
  if (build >= 18363) return '1909'
  if (build >= 18362) return '1903'
  if (build >= 17763) return '1809'
  if (build >= 17134) return '1803'
  if (build >= 16299) return '1709'

  return ''
}

/**
 * Read the macOS product version via `sw_vers`, falling back to the
 * Darwin kernel release if the command is unavailable.
 */
function getMacVersion(): RawVersion {
  try {
    const out = execFileSync('sw_vers', ['-productVersion'], {
      encoding: 'utf8',
      timeout: 3000
    }).trim()
    const [maj, min, patch] = out.split('.').map((n) => parseInt(n, 10) || 0)
    if (maj) {
      return { major: maj, minor: min || 0, build: patch || 0 }
    }
  } catch (err) {
    logger.debug('sw_vers unavailable, falling back to Darwin kernel mapping', {
      error: err instanceof Error ? err.message : String(err)
    })
  }

  // Fallback: map Darwin kernel major -> macOS major
  // Darwin 20 = macOS 11 ... Darwin 24 = macOS 15, Darwin 25 = macOS 26 (Tahoe)
  const darwinMajor = parseInt(release().split('.')[0], 10) || 0
  let macMajor = 0
  if (darwinMajor >= 25) macMajor = darwinMajor + 1 // 25 -> 26 (Apple's year-based jump)
  else if (darwinMajor >= 20) macMajor = darwinMajor - 9
  else if (darwinMajor >= 6) macMajor = 10 // legacy 10.x line
  return { major: macMajor, minor: 0, build: 0 }
}

/**
 * Get the macOS codename (e.g. "Tahoe", "Sequoia") for a version.
 */
function getMacEdition(major: number, minor: number): string {
  const modern: Record<number, string> = {
    26: 'Tahoe',
    15: 'Sequoia',
    14: 'Sonoma',
    13: 'Ventura',
    12: 'Monterey',
    11: 'Big Sur'
  }
  if (major === 10) {
    const legacy: Record<number, string> = {
      15: 'Catalina',
      14: 'Mojave',
      13: 'High Sierra',
      12: 'Sierra',
      11: 'El Capitan',
      10: 'Yosemite'
    }
    return legacy[minor] || ''
  }
  return modern[major] || ''
}

/**
 * Detect rich OS information for the current platform.
 * Result is cached after first call.
 */
export function getOsInfo(): OsInfo {
  if (cachedOsInfo) {
    return cachedOsInfo
  }

  const platform = detectPlatform()

  if (platform === 'windows') {
    const v = getWindowsVersion()
    const isWin11 = v.major === 10 && v.build >= 22000
    const edition = getWindowsVersionName(v.build)
    const name = isWin11 ? 'Windows 11' : 'Windows 10'
    const version = `${isWin11 ? '11' : '10'}${edition ? ` ${edition}` : ''}`
    // Always surface the exact build number, e.g. "WINDOWS 11 24H2 · 26100"
    const label = edition ? `${name} ${edition}` : name
    cachedOsInfo = {
      platform,
      major: v.major,
      minor: v.minor,
      build: v.build,
      name,
      edition,
      version,
      displayName: (v.build ? `${label} · ${v.build}` : label).toUpperCase(),
      isWindows11: isWin11
    }
    return cachedOsInfo
  }

  if (platform === 'macos') {
    const v = getMacVersion()
    const edition = getMacEdition(v.major, v.minor)
    const name = 'macOS'
    const version = v.major === 10 ? `${v.major}.${v.minor}.${v.build}` : `${v.major}.${v.minor}`
    cachedOsInfo = {
      platform,
      major: v.major,
      minor: v.minor,
      build: v.build,
      name,
      edition,
      version,
      displayName: (edition ? `macOS ${edition} · ${version}` : `macOS ${version}`).toUpperCase(),
      isWindows11: false
    }
    return cachedOsInfo
  }

  // Linux / unknown
  const kernel = release()
  cachedOsInfo = {
    platform,
    major: parseInt(kernel.split('.')[0], 10) || 0,
    minor: parseInt(kernel.split('.')[1], 10) || 0,
    build: 0,
    name: platform === 'linux' ? 'Linux' : 'Unknown OS',
    edition: '',
    version: kernel,
    displayName: (platform === 'linux' ? `Linux ${kernel}` : 'Unknown OS').toUpperCase(),
    isWindows11: false
  }
  return cachedOsInfo
}

/**
 * Get timeout multiplier based on OS/version.
 * Older Windows 10 versions are slower, especially on HDD.
 */
export function getTimeoutMultiplier(): number {
  if (detectPlatform() !== 'windows') return 1.0
  const version = getWindowsVersion()
  if (version.build >= 22000) return 1.0   // Win11
  if (version.build >= 19041) return 1.5   // Win10 2004+
  return 2.0                                // Win10 older
}

/**
 * Check if BAM (Background Activity Moderator) is available.
 * BAM requires Windows 10 build 16299 (Fall Creators Update) or later.
 */
export function isBAMAvailable(): boolean {
  if (detectPlatform() !== 'windows') return false

  const version = getWindowsVersion()

  // BAM was introduced in Windows 10 version 1709 (build 16299)
  // and is available on all later Windows 10/11 builds.
  if (version.major === 10 && version.build >= 16299) {
    return true
  }

  logger.debug('BAM not available on this Windows version', {
    version: `${version.major}.${version.minor}.${version.build}`,
    requiredBuild: 16299
  })

  return false
}
