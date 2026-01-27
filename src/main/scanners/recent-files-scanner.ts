import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

// Small batch size to prevent PowerShell hangs
const BATCH_SIZE = 15
// Overall scan timeout (30 seconds max)
const SCAN_TIMEOUT_MS = 30000

export class RecentFilesScanner extends BaseScanner {
  readonly name = 'Recent Files Scanner'
  readonly description = 'Scanning recently accessed files'

  /**
   * Resolve multiple .lnk shortcuts to their target paths in a single PowerShell call
   * Returns a Map of lnkPath -> targetPath
   */
  private async resolveLnkTargetsBatch(lnkPaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    if (lnkPaths.length === 0) return results

    try {
      // Build PowerShell script that processes all paths and outputs JSON
      const pathsArray = lnkPaths.map(p => p.replace(/'/g, "''")).join("','")
      const psScript = `
$shell = New-Object -ComObject WScript.Shell
$paths = @('${pathsArray}')
$results = @{}
foreach ($p in $paths) {
  try {
    $shortcut = $shell.CreateShortcut($p)
    if ($shortcut.TargetPath) {
      $results[$p] = $shortcut.TargetPath
    }
  } catch {}
}
$results | ConvertTo-Json -Compress
`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const output = await asyncExec(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        { timeout: 8000, maxBuffer: 5 * 1024 * 1024 } // Short timeout to prevent hangs
      )

      // Parse JSON output
      const trimmed = output.trim()
      if (trimmed && trimmed !== '{}') {
        try {
          const parsed = JSON.parse(trimmed)
          for (const [lnkPath, targetPath] of Object.entries(parsed)) {
            if (typeof targetPath === 'string' && targetPath) {
              results.set(lnkPath, targetPath)
            }
          }
        } catch {
          // JSON parsing failed, try line-by-line fallback
        }
      }
    } catch {
      // Batch resolution failed
    }

    return results
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    // Track overall scan time to prevent excessive duration
    const scanStartMs = Date.now()
    const isTimedOut = () => Date.now() - scanStartMs > SCAN_TIMEOUT_MS

    try {
      const recentFolder = join(
        homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'Recent'
      )

      if (!existsSync(recentFolder)) {
        return this.createSuccessResult([], startTime)
      }

      const results: string[] = []
      // Fix: Use timestamp subtraction instead of setDate() which fails on month boundaries
      const cutoffDate = new Date(Date.now() - this.scanSettings.recentFilesDays * 24 * 60 * 60 * 1000)

      const files = await readdir(recentFolder)

      // Phase 1: Collect all .lnk files that need processing
      const lnkFilesToResolve: { file: string; filePath: string; baseName: string; matchedByName: boolean }[] = []
      const directMatches: string[] = [] // Non-.lnk files that match keywords

      for (let i = 0; i < files.length; i++) {
        if (this.cancelled || isTimedOut()) break

        const file = files[i]
        const filePath = join(recentFolder, file)

        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: i + 1,
            totalItems: files.length,
            currentPath: `Analyzing: ${file}`,
            percentage: ((i + 1) / files.length) * 50 // First 50% for analysis
          })
        }

        try {
          const stats = await stat(filePath)

          // Skip if file is older than cutoff
          if (stats.mtime < cutoffDate) continue

          // Check if file name matches keywords
          // Remove .lnk extension for checking
          const baseName = file.replace(/\.lnk$/i, '')
          const isLnk = file.toLowerCase().endsWith('.lnk')

          if (this.keywordMatcher.containsKeyword(baseName)) {
            if (isLnk) {
              // Queue for batch resolution
              lnkFilesToResolve.push({ file, filePath, baseName, matchedByName: true })
            } else {
              // Non-.lnk file, add directly
              directMatches.push(filePath)
            }
          } else if (isLnk) {
            // Need to check target path for keywords
            lnkFilesToResolve.push({ file, filePath, baseName, matchedByName: false })
          }
        } catch {
          // Skip files we can't access
        }
      }

      // Add direct matches
      results.push(...directMatches)

      // Phase 2: Batch resolve .lnk files
      if (lnkFilesToResolve.length > 0 && !this.cancelled && !isTimedOut()) {
        const totalBatches = Math.ceil(lnkFilesToResolve.length / BATCH_SIZE)

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          if (this.cancelled || isTimedOut()) break

          const batchStart = batchIndex * BATCH_SIZE
          const batchEnd = Math.min(batchStart + BATCH_SIZE, lnkFilesToResolve.length)
          const batch = lnkFilesToResolve.slice(batchStart, batchEnd)

          if (events?.onProgress) {
            events.onProgress({
              scannerName: this.name,
              currentItem: batchIndex + 1,
              totalItems: totalBatches,
              currentPath: `Resolving shortcuts batch ${batchIndex + 1}/${totalBatches}`,
              percentage: 50 + ((batchIndex + 1) / totalBatches) * 50 // Second 50% for resolution
            })
          }

          // Resolve this batch
          const lnkPaths = batch.map(item => item.filePath)
          const resolvedTargets = await this.resolveLnkTargetsBatch(lnkPaths)

          // Process results
          for (const item of batch) {
            const targetPath = resolvedTargets.get(item.filePath)

            if (item.matchedByName) {
              // File name matched, include with target if available
              if (targetPath) {
                results.push(`${item.filePath} -> ${targetPath}`)
              } else {
                results.push(item.filePath)
              }
            } else if (targetPath && this.keywordMatcher.containsKeyword(targetPath)) {
              // Target path matches keyword
              results.push(`${item.filePath} -> ${targetPath}`)
            }
          }
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
}
