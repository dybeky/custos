import { existsSync } from 'fs'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

export class AmcacheScanner extends BaseScanner {
  readonly name = 'Amcache Scanner'
  readonly description = 'Scanning Amcache for program execution history'

  // Get Windows directory dynamically
  private get windowsDir(): string {
    return process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows'
  }

  /**
   * Execute PowerShell script using Base64 EncodedCommand for reliable escaping
   */
  private async execPowerShell(script: string, timeout = 30000): Promise<string> {
    // Encode script as UTF-16LE Base64 (required by PowerShell -EncodedCommand)
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    return asyncExec(
      `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
      { maxBuffer: 10 * 1024 * 1024, timeout }
    )
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []

      // Progress update
      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 1,
          totalItems: 3,
          currentPath: 'Scanning Amcache registry...',
          percentage: 33
        })
      }

      // Method 1: Query InventoryApplicationFile (Windows 10+)
      const inventoryResults = await this.scanInventoryApplicationFile()
      results.push(...inventoryResults)

      if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 2,
          totalItems: 3,
          currentPath: 'Scanning AppCompat Programs...',
          percentage: 66
        })
      }

      // Method 2: Query AppCompatFlags
      const appCompatResults = await this.scanAppCompatFlags()
      results.push(...appCompatResults)

      if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 3,
          totalItems: 3,
          currentPath: 'Scanning RecentFileCache...',
          percentage: 100
        })
      }

      // Method 3: Scan RecentFileCache.bcf if exists
      const recentCacheResults = await this.scanRecentFileCache()
      results.push(...recentCacheResults)

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

    try {
      // Query InventoryApplicationFile from Amcache via PowerShell
      // This contains info about executed programs
      const psScript = `
$ErrorActionPreference = 'SilentlyContinue'

Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' |
  Where-Object { $_.DisplayName -or $_.InstallLocation } |
  ForEach-Object {
    if ($_.InstallLocation) { $_.InstallLocation }
    if ($_.DisplayName) { "APP: " + $_.DisplayName }
  }

Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' |
  Where-Object { $_.DisplayName -or $_.InstallLocation } |
  ForEach-Object {
    if ($_.InstallLocation) { $_.InstallLocation }
    if ($_.DisplayName) { "APP: " + $_.DisplayName }
  }
`

      const output = await this.execPowerShell(psScript)

      const lines = output.split('\n')
      for (const line of lines) {
        if (this.cancelled) break
        const trimmed = line.trim()
        if (!trimmed) continue

        if (this.keywordMatcher.containsKeyword(trimmed)) {
          results.push(`[Amcache/Inventory] ${trimmed}`)
        }
      }
    } catch {
      // PowerShell query failed
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

    // Query all registry paths in parallel
    const queryPromises = registryPaths.map(async regPath => {
      if (this.cancelled) return []

      const pathResults: string[] = []
      try {
        const output = await asyncExec(`reg query "${regPath}" /s 2>nul`, {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 10000
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

    const allResults = await Promise.all(queryPromises)
    for (const pathResults of allResults) {
      results.push(...pathResults)
    }

    return results
  }

  private async scanRecentFileCache(): Promise<string[]> {
    const results: string[] = []

    // RecentFileCache.bcf location - use dynamic Windows path
    const recentFileCachePath = join(this.windowsDir, 'AppCompat', 'Programs', 'RecentFileCache.bcf')

    if (!existsSync(recentFileCachePath)) {
      return results
    }

    try {
      // Use PowerShell to read and parse the binary file
      // RecentFileCache.bcf contains UTF-16LE encoded file paths
      const psScript = `
$path = '${recentFileCachePath.replace(/\\/g, '\\\\')}'
if (Test-Path $path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $text = [System.Text.Encoding]::Unicode.GetString($bytes)
  $text -split '\\x00+' | Where-Object { $_ -match '\\\\' }
}
`

      const output = await this.execPowerShell(psScript, 15000)

      const lines = output.split('\n')
      for (const line of lines) {
        if (this.cancelled) break
        const trimmed = line.trim()
        if (!trimmed || !trimmed.includes('\\')) continue

        if (this.keywordMatcher.containsKeyword(trimmed)) {
          results.push(`[Amcache/RecentFileCache] ${trimmed}`)
        }
      }
    } catch {
      // Failed to read RecentFileCache
    }

    return results
  }
}
