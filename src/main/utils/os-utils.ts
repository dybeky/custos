import { asyncExec } from './async-exec'
import { logger } from '../services/logger'

interface WindowsVersion {
  major: number
  minor: number
  build: number
}

let cachedVersion: WindowsVersion | null = null

/**
 * Get Windows version info (major, minor, build)
 * Caches result for performance
 */
export async function getWindowsVersion(): Promise<WindowsVersion> {
  if (cachedVersion) {
    return cachedVersion
  }

  try {
    // Use wmic to get OS version
    const output = await asyncExec(
      'wmic os get Version /format:csv',
      { timeout: 5000 }
    )

    // Parse CSV output: Node,Version
    // Version format: "10.0.19045" or "10.0.22631"
    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('Node')) continue

      const parts = trimmed.split(',')
      if (parts.length >= 2) {
        const version = parts[1]?.trim()
        const versionParts = version?.split('.')
        if (versionParts && versionParts.length >= 3) {
          cachedVersion = {
            major: parseInt(versionParts[0]) || 10,
            minor: parseInt(versionParts[1]) || 0,
            build: parseInt(versionParts[2]) || 0
          }
          return cachedVersion
        }
      }
    }
  } catch (error) {
    logger.debug('Failed to get Windows version via wmic', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Fallback: assume Windows 10 with recent build
  cachedVersion = { major: 10, minor: 0, build: 19045 }
  return cachedVersion
}

/**
 * Check if BAM (Background Activity Moderator) is available
 * BAM requires Windows 10 build 16299 (Fall Creators Update) or later
 */
export async function isBAMAvailable(): Promise<boolean> {
  const version = await getWindowsVersion()

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
