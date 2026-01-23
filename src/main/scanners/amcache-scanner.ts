import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

export class AmcacheScanner extends BaseScanner {
  readonly name = 'Amcache Scanner'
  readonly description = 'Scanning Amcache for program execution history'

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
      const inventoryResults = this.scanInventoryApplicationFile()
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
      const appCompatResults = this.scanAppCompatFlags()
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
      const recentCacheResults = this.scanRecentFileCache()
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

  private scanInventoryApplicationFile(): string[] {
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

      const output = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000,
          windowsHide: true
        }
      )

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

  private scanAppCompatFlags(): string[] {
    const results: string[] = []

    const registryPaths = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\CIT\\System',
      'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Appraiser',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
      'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store',
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
    ]

    for (const regPath of registryPaths) {
      if (this.cancelled) break

      try {
        const output = execSync(`reg query "${regPath}" /s 2>nul`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 10000
        })

        const lines = output.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (this.keywordMatcher.containsKeyword(trimmed)) {
            results.push(`[Amcache/AppCompat] ${trimmed}`)
          }
        }
      } catch {
        // Registry key doesn't exist or access denied
      }
    }

    return results
  }

  private scanRecentFileCache(): string[] {
    const results: string[] = []

    // RecentFileCache.bcf location
    const recentFileCachePath = 'C:\\Windows\\AppCompat\\Programs\\RecentFileCache.bcf'

    if (!existsSync(recentFileCachePath)) {
      return results
    }

    try {
      // Use PowerShell to read and parse the binary file
      // RecentFileCache.bcf contains UTF-16LE encoded file paths
      const psScript = `
        $path = 'C:\\Windows\\AppCompat\\Programs\\RecentFileCache.bcf'
        if (Test-Path $path) {
          $bytes = [System.IO.File]::ReadAllBytes($path)
          $text = [System.Text.Encoding]::Unicode.GetString($bytes)
          $text -split '\\x00+' | Where-Object { $_ -match '\\\\' }
        }
      `

      const output = execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 15000,
          windowsHide: true
        }
      )

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
