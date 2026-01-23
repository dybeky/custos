import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

export class RecentFilesScanner extends BaseScanner {
  readonly name = 'Recent Files Scanner'
  readonly description = 'Scanning recently accessed files'

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
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.scanSettings.recentFilesDays)

      const files = readdirSync(recentFolder)

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
          const stats = statSync(filePath)

          // Skip if file is older than cutoff
          if (stats.mtime < cutoffDate) continue

          // Check if file name matches keywords
          // Remove .lnk extension for checking
          const baseName = file.replace(/\.lnk$/i, '')

          if (this.keywordMatcher.containsKeyword(baseName)) {
            results.push(filePath)
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
