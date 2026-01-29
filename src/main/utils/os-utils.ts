import { release } from 'os'
import { logger } from '../services/logger'

interface WindowsVersion {
  major: number
  minor: number
  build: number
}

let cachedVersion: WindowsVersion | null = null

/**
 * Get Windows version info (major, minor, build)
 * Uses Node.js os.release() which returns version like "10.0.26200"
 * Caches result for performance
 */
export function getWindowsVersion(): WindowsVersion {
  if (cachedVersion) {
    return cachedVersion
  }

  // os.release() returns "10.0.26200" format
  const osRelease = release()
  const parts = osRelease.split('.')

  cachedVersion = {
    major: parseInt(parts[0]) || 10,
    minor: parseInt(parts[1]) || 0,
    build: parseInt(parts[2]) || 0
  }

  return cachedVersion
}

/**
 * Check if current Windows is Windows 11
 * Windows 11 has build >= 22000
 */
export function isWindows11(): boolean {
  const version = getWindowsVersion()
  return version.major === 10 && version.build >= 22000
}

/**
 * Get Windows version codename (e.g., "23H2", "22H2")
 * Based on build number
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

  return ''
}

/**
 * Check if BAM (Background Activity Moderator) is available
 * BAM requires Windows 10 build 16299 (Fall Creators Update) or later
 */
export function isBAMAvailable(): boolean {
  const version = getWindowsVersion()

  // BAM was introduced in Windows 10 version 1709 (build 16299)
  // It's available on Windows 10 build 16299+ and all Windows 11
  if (version.major > 10) {
    return true // Windows 11+
  }

  if (version.major === 10 && version.build >= 16299) {
    return true
  }

  logger.debug('BAM not available on this Windows version', {
    version: `${version.major}.${version.minor}.${version.build}`,
    requiredBuild: 16299
  })

  return false
}
