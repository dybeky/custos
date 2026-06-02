import { existsSync, readdirSync, realpathSync } from 'fs'
import { join } from 'path'
import { ScanResult, ScanProgress } from '../../shared/types'
import { KeywordMatcher } from '../services/keyword-matcher'
import { ScanSettings } from '../services/config-service'
import { isWithin } from '../utils/path-safety'

/** Hard ceiling on directory recursion regardless of caller-supplied depth. */
const MAX_SCAN_DEPTH = 12

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

  protected abstract doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult>

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    try {
      return await this.doScan(events, startTime)
    } catch (error) {
      if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)
      return this.createErrorResult(error instanceof Error ? error.message : String(error), startTime)
    }
  }

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

    // Resolve the scan root's canonical path up front; every descent is checked
    // against it so a Windows junction / reparse point cannot redirect the walk
    // outside the intended root.
    let root: string
    try {
      root = realpathSync.native(path)
    } catch {
      return results
    }

    // Use synchronous scanning - simpler and more reliable
    const depth = Math.max(0, Math.min(Number.isFinite(maxDepth) ? maxDepth : 0, MAX_SCAN_DEPTH))
    const visited = new Set<string>([root])
    this.scanFolderSync(path, extensions, depth, 0, results, root, visited)
    return results
  }

  private scanFolderSync(
    path: string,
    extensions: string[],
    maxDepth: number,
    currentDepth: number,
    results: string[],
    root: string,
    visited: Set<string>
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
              // Resolve the real path to defend against Windows directory
              // junctions / reparse points (reported as plain directories, not
              // symlinks): skip entries that escape the scan root or revisit an
              // already-walked directory (junction loop).
              let real: string
              try {
                real = realpathSync.native(fullPath)
              } catch {
                continue
              }
              if (visited.has(real)) continue
              if (!isWithin(root, real)) continue
              visited.add(real)
              this.scanFolderSync(fullPath, extensions, maxDepth, currentDepth + 1, results, root, visited)
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

  protected emitProgress(
    events: ScannerEventEmitter | undefined,
    currentItem: number, totalItems: number, currentPath: string
  ): void {
    events?.onProgress?.({ scannerName: this.name, currentItem, totalItems, currentPath,
      percentage: totalItems > 0 ? (currentItem / totalItems) * 100 : 0 })
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
