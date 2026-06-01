import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { ScanResult, ScanProgress } from '../../shared/types'
import { KeywordMatcher } from '../services/keyword-matcher'
import { ScanSettings } from '../services/config-service'

export interface ScannerEventEmitter {
  onProgress?: (progress: ScanProgress) => void
}

export abstract class BaseScanner {
  protected keywordMatcher: KeywordMatcher
  protected scanSettings: ScanSettings
  protected excludedDirs: Set<string>
  protected cancelled = false

  abstract readonly name: string
  abstract readonly description: string

  constructor(keywordMatcher: KeywordMatcher, scanSettings: ScanSettings) {
    this.keywordMatcher = keywordMatcher
    this.scanSettings = scanSettings
    this.excludedDirs = new Set(
      scanSettings.excludedDirectories.map(d => d.toLowerCase())
    )
  }

  abstract scan(events?: ScannerEventEmitter): Promise<ScanResult>

  cancel(): void {
    this.cancelled = true
  }

  reset(): void {
    this.cancelled = false
  }

  protected async scanFolder(
    path: string,
    extensions: string[],
    maxDepth: number
  ): Promise<string[]> {
    const results: string[] = []
    if (!existsSync(path)) return results

    // Use synchronous scanning - simpler and more reliable
    this.scanFolderSync(path, extensions, maxDepth, 0, results)
    return results
  }

  private scanFolderSync(
    path: string,
    extensions: string[],
    maxDepth: number,
    currentDepth: number,
    results: string[]
  ): void {
    if (currentDepth > maxDepth) return
    if (this.cancelled) return

    try {
      const entries = readdirSync(path, { withFileTypes: true })

      for (const entry of entries) {
        if (this.cancelled) return

        const name = entry.name
        const fullPath = join(path, name)

        // Skip symlinks
        if (entry.isSymbolicLink()) continue

        try {
          if (entry.isDirectory()) {
            // Skip excluded directories
            if (this.excludedDirs.has(name.toLowerCase())) continue

            // Check if directory name matches keywords
            if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
              results.push(fullPath)
            }

            // Recurse into subdirectory
            if (currentDepth < maxDepth) {
              this.scanFolderSync(fullPath, extensions, maxDepth, currentDepth + 1, results)
            }
          } else if (entry.isFile()) {
            // Check if file name matches keywords
            if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
              if (extensions.length === 0 || this.hasExtension(name, extensions)) {
                results.push(fullPath)
              }
            }
          }
        } catch {
          // Skip inaccessible files/folders
          continue
        }
      }
    } catch {
      // Can't read directory - skip
    }
  }

  private hasExtension(fileName: string, extensions: string[]): boolean {
    const ext = this.getExtension(fileName).toLowerCase()
    return extensions.includes(ext)
  }

  private getExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.')
    return lastDot > 0 ? fileName.substring(lastDot) : ''
  }

  protected createSuccessResult(findings: string[], startTime: Date): ScanResult {
    const endTime = new Date()
    return {
      scannerName: this.name,
      success: true,
      findings,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      count: findings.length,
      hasFindings: findings.length > 0
    }
  }

  protected createErrorResult(error: string, startTime: Date): ScanResult {
    const endTime = new Date()
    return {
      scannerName: this.name,
      success: false,
      findings: [],
      error,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      count: 0,
      hasFindings: false
    }
  }
}
