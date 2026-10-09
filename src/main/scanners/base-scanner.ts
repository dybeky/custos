import { redactSecrets } from '../utils/redact'
import type { Dirent } from 'fs'
import { readdir, realpath } from 'fs/promises'
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

    // Resolve the scan root's canonical path up front; every descent is checked
    // against it so a Windows junction / reparse point cannot redirect the walk
    // outside the intended root. A missing/unreadable root yields no results.
    let root: string
    try {
      root = await realpath(path)
    } catch {
      return results
    }

    const depth = Math.max(0, Math.min(Number.isFinite(maxDepth) ? maxDepth : 0, MAX_SCAN_DEPTH))
    const visited = new Set<string>([root])
    await this.walkFolder(path, extensions, depth, 0, results, root, visited)
    return results
  }

  /**
   * Recursive, asynchronous directory walk. Async I/O keeps the Electron main
   * process responsive (window controls, IPC, progress, scanner timeouts) while
   * large trees like %APPDATA% or Program Files are traversed.
   */
  private async walkFolder(
    path: string,
    extensions: string[],
    maxDepth: number,
    currentDepth: number,
    results: string[],
    root: string,
    visited: Set<string>
  ): Promise<void> {
    if (currentDepth > maxDepth) return
    if (this.cancelled) return

    let entries: Dirent[]
    try {
      entries = await readdir(path, { withFileTypes: true })
    } catch {
      return // can't read directory - skip
    }

    for (const entry of entries) {
      if (this.cancelled) return

      const name = entry.name
      const fullPath = join(path, name)

      // Skip symlinks
      if (entry.isSymbolicLink()) continue

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (this.excludedDirs.has(name.toLowerCase())) continue

        // Check if directory name matches keywords
        if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
          results.push(fullPath)
        }

        if (currentDepth >= maxDepth) continue

        // Resolve the real path to defend against Windows directory junctions /
        // reparse points (reported as plain directories, not symlinks): skip
        // entries that escape the scan root or revisit an already-walked
        // directory (junction loop).
        let real: string
        try {
          real = await realpath(fullPath)
        } catch {
          continue
        }
        if (visited.has(real)) continue
        if (!isWithin(root, real)) continue
        visited.add(real)
        await this.walkFolder(fullPath, extensions, maxDepth, currentDepth + 1, results, root, visited)
      } else if (entry.isFile()) {
        // Check if file name matches keywords
        if (
          this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath) &&
          (extensions.length === 0 || this.hasExtension(name, extensions))
        ) {
          results.push(fullPath)
        }
      }
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
    // Every finding ends up in an uploaded report: never let a password,
    // e-mail or token copied off the PC (a window title, a command line) through.
    const clean = findings.map(redactSecrets)
    return {
      scannerName: this.name,
      success: true,
      findings: clean,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      count: clean.length,
      hasFindings: clean.length > 0
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
