import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

export class ShellbagsScanner extends BaseScanner {
  readonly name = 'Shellbags Scanner'
  readonly description = 'Scanning Shellbags for folder access history'

  private shellbagPaths = [
    // Explorer shellbags (current user)
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Bags',
    // Local settings shellbags (current user)
    'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\Bags',
    // Wow64 shellbags
    'HKCU\\Software\\Classes\\Wow6432Node\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Classes\\Wow6432Node\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\Bags'
  ]

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []
      const seenPaths = new Set<string>()

      const totalSteps = this.shellbagPaths.length

      // Scan shellbag paths with limited concurrency (max 2 at a time)
      const concurrency = 2
      let completed = 0

      for (let i = 0; i < this.shellbagPaths.length; i += concurrency) {
        if (this.cancelled) break

        const chunk = this.shellbagPaths.slice(i, i + concurrency)
        const chunkPromises = chunk.map(async (regPath) => {
          if (this.cancelled) return []

          completed++
          if (events?.onProgress) {
            events.onProgress({
              scannerName: this.name,
              currentItem: completed,
              totalItems: totalSteps,
              currentPath: regPath.split('\\').slice(-2).join('\\'),
              percentage: (completed / totalSteps) * 100
            })
          }

          return this.scanShellbagPath(regPath, seenPaths)
        })

        const chunkResults = await Promise.all(chunkPromises)
        for (const pathResults of chunkResults) {
          results.push(...pathResults)
        }
      }

      // Note: PowerShell deep scan removed - registry query already gets the data
      // and the PowerShell scan added 60s timeout causing potential freezes

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

  private async scanShellbagPath(regPath: string, seenPaths: Set<string>): Promise<string[]> {
    const results: string[] = []

    try {
      const output = await asyncExec(`reg query "${regPath}" /s 2>nul`, {
        maxBuffer: 20 * 1024 * 1024, // 20MB - shellbags can be large
        timeout: 30000
      })

      const lines = output.split('\n')
      let currentKey = ''

      for (const line of lines) {
        if (this.cancelled) break

        const trimmed = line.trim()
        if (!trimmed) continue

        // Track current registry key
        if (trimmed.startsWith('HKEY_')) {
          currentKey = trimmed
          continue
        }

        // Shellbag entries can contain folder paths in various formats
        // Check both the key path and value data for keywords
        const combined = `${currentKey} ${trimmed}`

        // Look for path-like patterns in the data
        const pathMatches = this.extractPaths(combined)

        for (const pathMatch of pathMatches) {
          if (seenPaths.has(pathMatch.toLowerCase())) continue

          if (this.keywordMatcher.containsKeyword(pathMatch)) {
            seenPaths.add(pathMatch.toLowerCase())
            results.push(`[Shellbags] ${pathMatch}`)
          }
        }

        // Also check the raw line for keywords
        if (this.keywordMatcher.containsKeyword(trimmed)) {
          // Extract meaningful part
          const parts = trimmed.split(/\s{4,}/)
          if (parts.length > 0) {
            const valuePart = parts[parts.length - 1] || parts[0]
            const key = `raw:${valuePart}`.toLowerCase()
            if (!seenPaths.has(key)) {
              seenPaths.add(key)
              results.push(`[Shellbags] ${trimmed}`)
            }
          }
        }
      }
    } catch {
      // Registry key doesn't exist or access denied
    }

    return results
  }

  private extractPaths(text: string): string[] {
    const paths: string[] = []

    // Match common path patterns
    // Drive letter paths: C:\folder\subfolder
    // eslint-disable-next-line no-control-regex
    const drivePathRegex = /[A-Z]:\\[^<>:"|?*\x00-\x1F]+/gi
    const driveMatches = text.match(drivePathRegex)
    if (driveMatches) {
      paths.push(...driveMatches)
    }

    // UNC paths: \\server\share
    // eslint-disable-next-line no-control-regex
    const uncRegex = /\\\\[^\\<>:"|?*\x00-\x1F]+\\[^<>:"|?*\x00-\x1F]*/gi
    const uncMatches = text.match(uncRegex)
    if (uncMatches) {
      paths.push(...uncMatches)
    }

    // Folder names that might be stored without full path
    // Look for common cheat-related folder patterns
    const folderNames = text.split(/[\\/\s]+/).filter(part =>
      part.length > 3 &&
      !part.match(/^(REG_|HKEY_|Software|Microsoft|Windows|Shell|Bags?|MRU)$/i)
    )
    paths.push(...folderNames)

    return [...new Set(paths)] // Remove duplicates
  }
}
