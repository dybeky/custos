import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { isBAMAvailable } from '../utils/os-utils'
import { logger } from '../services/logger'

export class BamScanner extends BaseScanner {
  readonly name = 'BAM/DAM Scanner'
  readonly description = 'Scanning Background Activity Moderator for execution history'

  // Cache for volume-to-drive mapping
  private driveMapping: Map<number, string> | null = null

  reset(): void {
    super.reset()
    this.driveMapping = null
  }

  /**
   * Get the mapping between HarddiskVolume numbers and drive letters
   * Uses wmic (faster and more reliable than PowerShell)
   */
  private async getDriveMapping(): Promise<Map<number, string>> {
    if (this.driveMapping) return this.driveMapping

    this.driveMapping = new Map()
    try {
      // Use wmic instead of PowerShell - much faster
      const output = await asyncExec(
        'wmic volume get DeviceID,DriveLetter /format:csv 2>nul',
        { timeout: 5000 }
      )

      // Parse CSV output: Node,DeviceID,DriveLetter
      const lines = output.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('Node')) continue

        const parts = trimmed.split(',')
        if (parts.length >= 3) {
          const deviceId = parts[1]
          const driveLetter = parts[2]?.trim()
          if (driveLetter && deviceId) {
            const volMatch = deviceId.match(/HarddiskVolume(\d+)/)
            if (volMatch) {
              this.driveMapping.set(parseInt(volMatch[1]), driveLetter)
            }
          }
        }
      }
    } catch {
      // wmic failed - try mountvol fallback
    }

    // Secondary fallback: mountvol to determine real drive mappings
    if (this.driveMapping.size === 0) {
      try {
        const mountvolOutput = await asyncExec('mountvol', { timeout: 5000 })
        // mountvol output pairs: \\?\Volume{GUID}\ followed by drive letter line (e.g. "    C:\")
        const lines = mountvolOutput.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const driveLine = lines[i].trim()
          // Drive letter lines look like "C:\" or "D:\"
          if (/^[A-Z]:\\$/i.test(driveLine) && i > 0) {
            // Look backward for the volume GUID line
            const volLine = lines[i - 1].trim()
            const volMatch = volLine.match(/HarddiskVolume(\d+)/)
            if (volMatch && volMatch[1]) {
              const volNum = parseInt(volMatch[1], 10)
              if (!isNaN(volNum)) {
                this.driveMapping.set(volNum, driveLine.slice(0, 2))
              }
            }
          }
        }
      } catch {
        logger.warn('Both wmic and mountvol failed for drive mapping — device paths will not be resolved')
      }
    }

    return this.driveMapping
  }

  /**
   * Parse FILETIME (100-nanosecond intervals since 1601-01-01) from hex data
   */
  private parseFiletime(hexData: string): Date | null {
    try {
      // BAM stores FILETIME as 8 bytes in little-endian format
      const cleanHex = hexData.replace(/\s/g, '')
      if (cleanHex.length < 16) return null

      // Parse first 8 bytes (64-bit FILETIME)
      const bytes: number[] = []
      for (let i = 0; i < 16; i += 2) {
        bytes.push(parseInt(cleanHex.substring(i, i + 2), 16))
      }

      // Little-endian to BigInt
      let filetime = BigInt(0)
      for (let i = 7; i >= 0; i--) {
        filetime = (filetime << BigInt(8)) | BigInt(bytes[i])
      }

      // FILETIME epoch: 1601-01-01, Unix epoch: 1970-01-01
      // Difference: 11644473600 seconds = 116444736000000000 * 100ns
      const FILETIME_UNIX_DIFF = BigInt(116444736000000000)

      // Convert to milliseconds (BigInt)
      const unixMsBig = (filetime - FILETIME_UNIX_DIFF) / BigInt(10000)

      // Sanity check in BigInt domain before converting to Number (prevents Infinity/NaN)
      const MIN_MS = BigInt(946684800000)   // 2000-01-01
      const MAX_MS = BigInt(4102444800000)  // 2100-01-01
      if (unixMsBig < MIN_MS || unixMsBig > MAX_MS) return null

      const unixMs = Number(unixMsBig)

      return new Date(unixMs)
    } catch {
      return null
    }
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      // Check if BAM is available on this Windows version (requires build 16299+)
      const bamAvailable = isBAMAvailable()
      if (!bamAvailable) {
        return this.createSuccessResult(
          ['[BAM/DAM] Not available on this Windows version (requires Windows 10 build 16299 or later)'],
          startTime
        )
      }

      const results: string[] = []

      // Get all user SIDs to scan BAM/DAM for each user
      const userSids = await this.getUserSids()

      // Collect all BAM and DAM paths to scan in parallel
      const scanPaths: { path: string; source: string }[] = []

      // BAM paths (Background Activity Moderator)
      for (const sid of userSids) {
        scanPaths.push({
          path: `HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings\\${sid}`,
          source: 'BAM'
        })
      }

      // DAM paths (Desktop Activity Moderator)
      for (const sid of userSids) {
        scanPaths.push({
          path: `HKLM\\SYSTEM\\CurrentControlSet\\Services\\dam\\State\\UserSettings\\${sid}`,
          source: 'DAM'
        })
      }

      // Backup control sets
      const backupControlSets = ['ControlSet001', 'ControlSet002']
      for (const controlSet of backupControlSets) {
        for (const sid of userSids) {
          scanPaths.push({
            path: `HKLM\\SYSTEM\\${controlSet}\\Services\\bam\\State\\UserSettings\\${sid}`,
            source: `BAM/${controlSet}`
          })
        }
      }

      // Scan paths with limited concurrency (max 3 at a time to avoid process limiter overload)
      const concurrency = 3
      let completed = 0

      for (let i = 0; i < scanPaths.length; i += concurrency) {
        if (this.cancelled) break

        const chunk = scanPaths.slice(i, i + concurrency)
        const chunkPromises = chunk.map(async ({ path, source }) => {
          if (this.cancelled) return []

          completed++
          if (events?.onProgress) {
            events.onProgress({
              scannerName: this.name,
              currentItem: completed,
              totalItems: scanPaths.length,
              currentPath: `${source} - scanning...`,
              percentage: (completed / scanPaths.length) * 100
            })
          }

          return this.scanRegistryPath(path, source)
        })

        const chunkResults = await Promise.all(chunkPromises)
        for (const pathResults of chunkResults) {
          results.push(...pathResults)
        }
      }

      return this.createSuccessResult(results, startTime)
    } catch (error) {
      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      )
    }
  }

  private async getUserSids(): Promise<string[]> {
    const sids: string[] = []

    try {
      // Get all user SIDs from the BAM registry
      const output = await asyncExec(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings" 2>nul',
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 10000
        }
      )

      const lines = output.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        // SID lines look like: HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\bam\State\UserSettings\S-1-5-21-...
        if (trimmed.includes('S-1-5-21-')) {
          const sidMatch = trimmed.match(/S-1-5-21-[\d-]+/)
          if (sidMatch) {
            sids.push(sidMatch[0])
          }
        }
      }
    } catch {
      // BAM might not exist on older Windows versions
    }

    // If no SIDs found, try to get current user SID
    if (sids.length === 0) {
      try {
        const output = await asyncExec('whoami /user /fo csv /nh', {
          timeout: 5000
        })
        const match = output.match(/S-1-5-21-[\d-]+/)
        if (match) {
          sids.push(match[0])
        }
      } catch {
        // Fallback failed
      }
    }

    return [...new Set(sids)] // Remove duplicates
  }

  private async scanRegistryPath(regPath: string, source: string): Promise<string[]> {
    const results: string[] = []

    try {
      const output = await asyncExec(`reg query "${regPath}" /s 2>nul`, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000
      })

      const lines = output.split('\n')
      for (const line of lines) {
        if (this.cancelled) break

        const trimmed = line.trim()
        if (!trimmed) continue

        // BAM/DAM entries contain file paths with device paths or regular paths
        // Example: \Device\HarddiskVolume3\Users\user\Desktop\program.exe
        // or: C:\Users\user\Desktop\program.exe

        // Skip registry key headers
        if (trimmed.startsWith('HKEY_')) continue

        // Parse registry value line
        // Format: ValueName    REG_BINARY    HexData
        // The ValueName contains the executable path
        const parts = trimmed.split(/\s{4,}/)
        if (parts.length > 0) {
          const valueName = parts[0]

          // Check if the value name contains a path
          if (valueName.includes('\\') || valueName.includes('/')) {
            // Extract filename from path for keyword matching
            const pathToCheck = await this.normalizeDevicePath(valueName)

            if (this.keywordMatcher.containsKeyword(pathToCheck)) {
              // Try to extract timestamp if available
              const timestamp = this.parseTimestamp(parts)
              let entry = `[${source}] ${pathToCheck}`
              if (timestamp) {
                entry += ` | ${timestamp}`
              }
              results.push(entry)
            }
          }
        }
      }
    } catch {
      // Registry key doesn't exist or access denied
    }

    return results
  }

  private async normalizeDevicePath(path: string): Promise<string> {
    // Convert device paths to regular paths
    // \Device\HarddiskVolume3\... -> C:\...
    let normalized = path

    // Remove leading backslashes
    normalized = normalized.replace(/^\\+/, '')

    // Try to convert device paths using actual drive mapping
    const deviceMatch = normalized.match(/Device\\HarddiskVolume(\d+)\\(.*)/)
    if (deviceMatch) {
      const volumeNumStr = deviceMatch[1]
      const restPath = deviceMatch[2]

      // Guard against undefined/empty capture groups
      if (volumeNumStr && restPath) {
        const volumeNum = parseInt(volumeNumStr, 10)
        if (!isNaN(volumeNum)) {
          const mapping = await this.getDriveMapping()
          const driveLetter = mapping.get(volumeNum)
          if (driveLetter) {
            normalized = `${driveLetter}\\${restPath}`
          }
          // If no mapping found, leave device path as-is (keyword matcher will still work on filename)
        }
      }
    }

    return normalized
  }

  private parseTimestamp(parts: string[]): string | null {
    // BAM stores timestamps as REG_BINARY in FILETIME format
    try {
      if (parts.length >= 3 && parts[1] === 'REG_BINARY') {
        const date = this.parseFiletime(parts[2])
        if (date) {
          return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        }
      }
    } catch {
      // Parsing failed
    }
    return null
  }
}
