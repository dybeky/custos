import { readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
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

  protected scanFolder(
    path: string,
    extensions: string[],
    maxDepth: number
  ): string[] {
    const results: string[] = []
    if (!existsSync(path)) return results

    this.scanFolderRecursive(path, extensions, maxDepth, 0, results)
    return results
  }

  private scanFolderRecursive(
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

        try {
          const fullPath = join(path, entry.name)
          const name = entry.name

          // Skip system files
          try {
            const stats = statSync(fullPath)
            if (stats.isSymbolicLink()) continue
          } catch {
            continue
          }

          const isHidden = this.isHiddenFile(fullPath)

          if (entry.isDirectory()) {
            // Skip excluded directories
            if (this.excludedDirs.has(name.toLowerCase())) continue

            // Check if directory name matches keywords
            if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
              const suffix = isHidden ? ' [HIDDEN]' : ''
              results.push(fullPath + suffix)
            }

            // Recurse into subdirectory
            this.scanFolderRecursive(fullPath, extensions, maxDepth, currentDepth + 1, results)
          } else if (entry.isFile()) {
            // Check if file name matches keywords
            if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
              if (extensions.length === 0 || this.hasExtension(name, extensions)) {
                const suffix = isHidden ? ' [HIDDEN]' : ''
                results.push(fullPath + suffix)
              }
            }
          }
        } catch {
          // Skip files/folders we can't access
        }
      }
    } catch {
      // Skip folders we can't read
    }
  }

  private isHiddenFile(filePath: string): boolean {
    try {
      // On Windows, check file attributes
      if (process.platform === 'win32') {
        const stats = statSync(filePath)
        // File is hidden if it has the hidden attribute (mode check)
        // Windows hidden files typically start with . or have hidden attribute
        const fileName = basename(filePath)
        return fileName.startsWith('.')
      }
      return false
    } catch {
      return false
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
