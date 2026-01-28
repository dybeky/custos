import { asyncExec } from './async-exec'
import { logger } from '../services/logger'

// Cache for available drives (valid for 30 seconds)
let cachedDrives: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30000

/**
 * Get all available drives on the system using wmic
 * Returns array like ['C:', 'D:', 'E:']
 * Results are cached for 30 seconds for performance
 */
export async function getAvailableDrives(): Promise<string[]> {
  // Return cached result if still valid
  if (cachedDrives && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedDrives
  }

  const drives: string[] = []

  try {
    // Use wmic to get all logical disks (DriveType 3 = Local Disk, 2 = Removable)
    const output = await asyncExec(
      'wmic logicaldisk where "DriveType=2 or DriveType=3" get DeviceID /format:csv',
      { timeout: 5000 }
    )

    // Parse CSV output: Node,DeviceID
    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('Node')) continue

      const parts = trimmed.split(',')
      if (parts.length >= 2) {
        const deviceId = parts[1]?.trim()
        // Validate drive letter format (e.g., "C:")
        if (deviceId && /^[A-Z]:$/i.test(deviceId)) {
          drives.push(deviceId.toUpperCase())
        }
      }
    }
  } catch (error) {
    logger.debug('wmic drive detection failed, using fallback', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Fallback: if wmic failed, check common drive letters
  if (drives.length === 0) {
    drives.push(...(await getFallbackDrives()))
  }

  // Ensure C: is always included and first
  if (!drives.includes('C:')) {
    drives.unshift('C:')
  } else {
    // Move C: to front if not already
    const idx = drives.indexOf('C:')
    if (idx > 0) {
      drives.splice(idx, 1)
      drives.unshift('C:')
    }
  }

  const result = [...new Set(drives)] // Remove duplicates

  // Update cache
  cachedDrives = result
  cacheTimestamp = Date.now()

  return result
}

/**
 * Fallback drive detection using fsutil (if wmic fails)
 */
async function getFallbackDrives(): Promise<string[]> {
  const drives: string[] = []

  try {
    // Try fsutil as fallback
    const output = await asyncExec('fsutil fsinfo drives', { timeout: 5000 })
    // Output format: "Drives: C:\ D:\ E:\"
    const match = output.match(/Drives:\s*(.+)/i)
    if (match) {
      const driveLetters = match[1].match(/[A-Z]:/gi)
      if (driveLetters) {
        drives.push(...driveLetters.map(d => d.toUpperCase()))
      }
    }
  } catch {
    // fsutil also failed, return common defaults
    logger.debug('fsutil fallback also failed, using hardcoded defaults')
  }

  // If all else fails, return common defaults
  if (drives.length === 0) {
    return ['C:', 'D:', 'E:', 'F:']
  }

  return drives
}
