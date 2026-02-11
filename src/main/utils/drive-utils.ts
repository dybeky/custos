import { asyncExec } from './async-exec'
import { logger } from '../services/logger'

// Cache for available drives (valid for 30 seconds)
let cachedDrives: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30000

/**
 * Get all available drives on the system using PowerShell (with fsutil fallback)
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
    // Use PowerShell Get-CimInstance (wmic is removed from Win11 24H2+ clean installs)
    const psScript = `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2 or DriveType=3" | Select-Object -ExpandProperty DeviceID`
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
    const output = await asyncExec(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { timeout: 5000 }
    )

    const lines = output.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && /^[A-Z]:$/i.test(trimmed)) {
        drives.push(trimmed.toUpperCase())
      }
    }
  } catch (error) {
    logger.debug('PowerShell drive detection failed, using fallback', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  // Fallback: if PowerShell failed, try fsutil
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
 * Fallback drive detection using fsutil (if PowerShell fails)
 */
async function getFallbackDrives(): Promise<string[]> {
  const drives: string[] = []

  try {
    // Try fsutil as fallback — extract drive letters directly (locale-independent)
    // Output varies by locale: "Drives: C:\ D:\" (EN), "Laufwerke: C:\ D:\" (DE), etc.
    const output = await asyncExec('fsutil fsinfo drives', { timeout: 5000 })
    const driveLetters = output.match(/[A-Z]:\\/gi)
    if (driveLetters) {
      drives.push(...driveLetters.map(d => d.slice(0, 2).toUpperCase()))
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
