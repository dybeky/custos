import { execSync } from 'child_process'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

export class BamScanner extends BaseScanner {
  readonly name = 'BAM/DAM Scanner'
  readonly description = 'Scanning Background Activity Moderator for execution history'

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []

      // Get all user SIDs to scan BAM/DAM for each user
      const userSids = this.getUserSids()

      let currentStep = 0
      const totalSteps = userSids.length * 2 // BAM + DAM for each user

      // Scan BAM (Background Activity Moderator)
      for (const sid of userSids) {
        if (this.cancelled) break

        currentStep++
        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: currentStep,
            totalItems: totalSteps,
            currentPath: `BAM - ${sid}`,
            percentage: (currentStep / totalSteps) * 100
          })
        }

        const bamPath = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings\\${sid}`
        const bamResults = this.scanRegistryPath(bamPath, 'BAM')
        results.push(...bamResults)
      }

      // Scan DAM (Desktop Activity Moderator)
      for (const sid of userSids) {
        if (this.cancelled) break

        currentStep++
        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: currentStep,
            totalItems: totalSteps,
            currentPath: `DAM - ${sid}`,
            percentage: (currentStep / totalSteps) * 100
          })
        }

        const damPath = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\dam\\State\\UserSettings\\${sid}`
        const damResults = this.scanRegistryPath(damPath, 'DAM')
        results.push(...damResults)
      }

      // Also scan ControlSet001 and ControlSet002 (backup control sets)
      const backupControlSets = ['ControlSet001', 'ControlSet002']
      for (const controlSet of backupControlSets) {
        if (this.cancelled) break

        for (const sid of userSids) {
          const bamPath = `HKLM\\SYSTEM\\${controlSet}\\Services\\bam\\State\\UserSettings\\${sid}`
          const bamResults = this.scanRegistryPath(bamPath, `BAM/${controlSet}`)
          results.push(...bamResults)
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

  private getUserSids(): string[] {
    const sids: string[] = []

    try {
      // Get all user SIDs from the BAM registry
      const output = execSync(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings" 2>nul',
        {
          encoding: 'utf-8',
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
        const output = execSync('whoami /user /fo csv /nh', {
          encoding: 'utf-8',
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

  private scanRegistryPath(regPath: string, source: string): string[] {
    const results: string[] = []

    try {
      const output = execSync(`reg query "${regPath}" /s 2>nul`, {
        encoding: 'utf-8',
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
            const pathToCheck = this.normalizeDevicePath(valueName)

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

  private normalizeDevicePath(path: string): string {
    // Convert device paths to regular paths
    // \Device\HarddiskVolume3\... -> C:\...
    // This is a simplified conversion
    let normalized = path

    // Remove leading backslashes
    normalized = normalized.replace(/^\\+/, '')

    // Try to convert device paths
    const deviceMatch = normalized.match(/Device\\HarddiskVolume(\d+)\\(.*)/)
    if (deviceMatch) {
      // Common mapping: Volume1 = C:, Volume2 = D:, etc.
      // This is simplified and may not always be accurate
      const volumeNum = parseInt(deviceMatch[1])
      const driveLetter = String.fromCharCode(65 + volumeNum) // A, B, C, D...
      normalized = `${driveLetter}:\\${deviceMatch[2]}`
    }

    return normalized
  }

  private parseTimestamp(parts: string[]): string | null {
    // BAM stores timestamps as REG_BINARY in FILETIME format
    // This is a simplified parser - full timestamp extraction would require
    // proper binary parsing
    try {
      if (parts.length >= 3 && parts[1] === 'REG_BINARY') {
        // Timestamp is in the hex data, but parsing FILETIME from hex is complex
        // For now, just indicate data exists
        return null
      }
    } catch {
      // Parsing failed
    }
    return null
  }
}
