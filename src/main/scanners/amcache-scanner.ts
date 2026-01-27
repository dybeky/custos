import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

// Overall scan timeout (45 seconds max)
const SCAN_TIMEOUT_MS = 45000

export class AmcacheScanner extends BaseScanner {
  readonly name = 'Amcache Scanner'
  readonly description = 'Scanning Amcache for program execution history'

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    // Track overall scan time to prevent excessive duration
    const scanStartMs = Date.now()
    const isTimedOut = () => Date.now() - scanStartMs > SCAN_TIMEOUT_MS

    try {
      const results: string[] = []

      // Progress update
      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 1,
          totalItems: 2,
          currentPath: 'Scanning Amcache registry...',
          percentage: 50
        })
      }

      // Method 1: Query InventoryApplicationFile (Windows 10+)
      if (!isTimedOut()) {
        const inventoryResults = await this.scanInventoryApplicationFile()
        results.push(...inventoryResults)
      }

      if (this.cancelled || isTimedOut()) {
        return this.cancelled
          ? this.createErrorResult('Scan cancelled', startTime)
          : this.createSuccessResult(results, startTime) // Return partial results on timeout
      }

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 2,
          totalItems: 2,
          currentPath: 'Scanning AppCompat Programs...',
          percentage: 100
        })
      }

      // Method 2: Query AppCompatFlags
      if (!isTimedOut()) {
        const appCompatResults = await this.scanAppCompatFlags()
        results.push(...appCompatResults)
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

  private async scanInventoryApplicationFile(): Promise<string[]> {
    const results: string[] = []

    // Use reg query instead of PowerShell - much faster and more reliable
    const uninstallPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    ]

    for (const regPath of uninstallPaths) {
      if (this.cancelled) break

      try {
        const output = await asyncExec(`reg query "${regPath}" /s 2>nul`, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 15000
        })

        const lines = output.split('\n')
        for (const line of lines) {
          if (this.cancelled) break
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('HKEY_')) continue

          // Look for DisplayName and InstallLocation values
          if (trimmed.includes('DisplayName') || trimmed.includes('InstallLocation')) {
            const parts = trimmed.split(/\s{4,}/)
            if (parts.length >= 3) {
              const data = parts.slice(2).join(' ')
              if (this.keywordMatcher.containsKeyword(data)) {
                results.push(`[Amcache/Inventory] ${data}`)
              }
            }
          }
        }
      } catch {
        // Registry query failed
      }
    }

    return results
  }

  private async scanAppCompatFlags(): Promise<string[]> {
    const results: string[] = []

    const registryPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\CIT\\System',
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Appraiser',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
    ]

    // Query registry paths with limited concurrency (max 2 at a time)
    const concurrency = 2
    for (let i = 0; i < registryPaths.length; i += concurrency) {
      if (this.cancelled) break

      const chunk = registryPaths.slice(i, i + concurrency)
      const chunkPromises = chunk.map(async regPath => {
        if (this.cancelled) return []

        const pathResults: string[] = []
        try {
          const output = await asyncExec(`reg query "${regPath}" /s 2>nul`, {
            maxBuffer: 5 * 1024 * 1024,
            timeout: 15000
          })

          const lines = output.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            if (this.keywordMatcher.containsKeyword(trimmed)) {
              pathResults.push(`[Amcache/AppCompat] ${trimmed}`)
            }
          }
        } catch {
          // Registry key doesn't exist or access denied
        }
        return pathResults
      })

      const chunkResults = await Promise.all(chunkPromises)
      for (const pathResults of chunkResults) {
        results.push(...pathResults)
      }
    }

    return results
  }

}
