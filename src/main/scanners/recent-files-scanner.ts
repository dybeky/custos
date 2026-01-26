import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'

export class RecentFilesScanner extends BaseScanner {
  readonly name = 'Recent Files Scanner'
  readonly description = 'Scanning recently accessed files'

  /**
   * Resolve .lnk shortcut to its target path using PowerShell WScript.Shell
   */
  private async resolveLnkTarget(lnkPath: string): Promise<string | null> {
    try {
      // Escape path for PowerShell
      const escapedPath = lnkPath.replace(/'/g, "''")
      const psScript = `$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('${escapedPath}'); $shortcut.TargetPath`

      const output = await asyncExec(
        `powershell -NoProfile -Command "${psScript}"`,
        { timeout: 5000 }
      )
      const targetPath = output.trim()
      return targetPath || null
    } catch {
      return null
    }
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

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

      for (let i = 0; i < files.length; i++) {
        if (this.cancelled) break

        const file = files[i]
        const filePath = join(recentFolder, file)

        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: i + 1,
            totalItems: files.length,
            currentPath: file,
            percentage: ((i + 1) / files.length) * 100
          })
        }

        try {
          const stats = await stat(filePath)

          // Skip if file is older than cutoff
          if (stats.mtime < cutoffDate) continue

          // Check if file name matches keywords
          // Remove .lnk extension for checking
          const baseName = file.replace(/\.lnk$/i, '')

          // First check the shortcut name itself
          if (this.keywordMatcher.containsKeyword(baseName)) {
            // Try to resolve the .lnk target for more context
            const targetPath = await this.resolveLnkTarget(filePath)
            if (targetPath) {
              results.push(`${filePath} -> ${targetPath}`)
            } else {
              results.push(filePath)
            }
          } else if (file.toLowerCase().endsWith('.lnk')) {
            // Also check the resolved target path for keywords
            const targetPath = await this.resolveLnkTarget(filePath)
            if (targetPath && this.keywordMatcher.containsKeyword(targetPath)) {
              results.push(`${filePath} -> ${targetPath}`)
            }
          }
        } catch {
          // Skip files we can't access
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
