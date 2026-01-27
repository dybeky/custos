import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import { ScanResult, ScanProgress } from '../../shared/types'
import { KeywordMatcher } from '../services/keyword-matcher'
import { ScanSettings } from '../services/config-service'
import { asyncExec } from '../utils/async-exec'

export interface ScannerEventEmitter {
  onProgress?: (progress: ScanProgress) => void
}

/**
 * Simple concurrency limiter for parallel operations
 */
class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []

  constructor(private maxConcurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrency) {
      await new Promise<void>(resolve => this.queue.push(resolve))
    }

    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

export abstract class BaseScanner {
  protected keywordMatcher: KeywordMatcher
  protected scanSettings: ScanSettings
  protected excludedDirs: Set<string>
  protected cancelled = false

  // Concurrency limit for parallel file system operations
  protected static readonly MAX_CONCURRENCY = 10

  // Cache for NTFS hidden attribute checks with size limit to prevent memory leaks
  private hiddenCache = new Map<string, boolean>()
  private static readonly MAX_CACHE_SIZE = 10000

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
    this.hiddenCache.clear()
  }

  protected async scanFolder(
    path: string,
    extensions: string[],
    maxDepth: number
  ): Promise<string[]> {
    const results: string[] = []
    if (!existsSync(path)) return results

    await this.scanFolderRecursive(path, extensions, maxDepth, 0, results)
    return results
  }

  private async scanFolderRecursive(
    path: string,
    extensions: string[],
    maxDepth: number,
    currentDepth: number,
    results: string[],
    limiter?: ConcurrencyLimiter
  ): Promise<void> {
    if (currentDepth > maxDepth) return
    if (this.cancelled) return

    // Create limiter at root level
    const concurrencyLimiter = limiter || new ConcurrencyLimiter(BaseScanner.MAX_CONCURRENCY)

    try {
      const entries = await readdir(path, { withFileTypes: true })

      // Batch check NTFS hidden attributes for efficiency
      if (process.platform === 'win32' && entries.length > 0) {
        const allPaths = entries.map(e => join(path, e.name))
        await this.checkNtfsHiddenBatch(allPaths)
      }

      // Process entries in batches
      const batchSize = 50
      for (let i = 0; i < entries.length; i += batchSize) {
        if (this.cancelled) return

        const batch = entries.slice(i, i + batchSize)
        const subDirPromises: Promise<void>[] = []

        for (const entry of batch) {
          if (this.cancelled) return

          try {
            const fullPath = join(path, entry.name)
            const name = entry.name

            // Skip system files
            try {
              const stats = await stat(fullPath)
              if (stats.isSymbolicLink()) continue
            } catch (error) {
              // Log access errors at debug level
              const code = (error as NodeJS.ErrnoException).code
              if (code !== 'ENOENT' && code !== 'EPERM' && code !== 'EACCES') {
                console.debug(`[${this.name}] Skipped ${fullPath}: ${code}`)
              }
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

              // Queue subdirectory with concurrency limit
              if (currentDepth < maxDepth) {
                subDirPromises.push(
                  concurrencyLimiter.run(() =>
                    this.scanFolderRecursive(fullPath, extensions, maxDepth, currentDepth + 1, results, concurrencyLimiter)
                  )
                )
              }
            } else if (entry.isFile()) {
              // Check if file name matches keywords
              if (this.keywordMatcher.containsKeywordWithWhitelist(name, fullPath)) {
                if (extensions.length === 0 || this.hasExtension(name, extensions)) {
                  const suffix = isHidden ? ' [HIDDEN]' : ''
                  results.push(fullPath + suffix)
                }
              }
            }
          } catch (error) {
            // Log unexpected errors
            const code = (error as NodeJS.ErrnoException).code
            if (code && code !== 'ENOENT' && code !== 'EPERM' && code !== 'EACCES') {
              console.debug(`[${this.name}] Error processing entry: ${code}`)
            }
          }
        }

        // Wait for all subdirectory scans in this batch
        if (subDirPromises.length > 0) {
          await Promise.all(subDirPromises)
        }
      }
    } catch (error) {
      // Log folder read errors
      const code = (error as NodeJS.ErrnoException).code
      if (code && code !== 'ENOENT' && code !== 'EPERM' && code !== 'EACCES') {
        console.debug(`[${this.name}] Cannot read folder ${path}: ${code}`)
      }
    }
  }

  /**
   * Check if file is hidden (considers both Unix-style dotfiles and NTFS hidden attribute)
   */
  private isHiddenFile(filePath: string): boolean {
    const fileName = basename(filePath)

    // Unix-style hidden files (start with .)
    if (fileName.startsWith('.')) {
      return true
    }

    // On Windows, check NTFS hidden attribute from cache
    if (process.platform === 'win32') {
      return this.hiddenCache.get(filePath) || false
    }

    return false
  }

  /**
   * Check NTFS hidden attribute using PowerShell (batch mode for efficiency)
   */
  private async checkNtfsHiddenBatch(paths: string[]): Promise<void> {
    if (process.platform !== 'win32' || paths.length === 0) return

    try {
      // Build PowerShell script to check multiple files
      const pathsJson = JSON.stringify(paths)
      const psScript = `
$paths = ${pathsJson} | ConvertFrom-Json
foreach ($p in $paths) {
  try {
    $attr = (Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue).Attributes
    if ($attr -band [IO.FileAttributes]::Hidden) {
      $p
    }
  } catch {}
}
`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const output = await asyncExec(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        { timeout: 5000, maxBuffer: 1024 * 1024 }
      )

      // Mark hidden files in cache
      const hiddenPaths = output.split('\n').map(l => l.trim()).filter(Boolean)
      for (const hp of hiddenPaths) {
        // Evict half of the cache when limit is reached to prevent unbounded growth
        if (this.hiddenCache.size >= BaseScanner.MAX_CACHE_SIZE) {
          const keys = Array.from(this.hiddenCache.keys())
          keys.slice(0, Math.floor(keys.length / 2)).forEach(k => this.hiddenCache.delete(k))
        }
        this.hiddenCache.set(hp, true)
      }
    } catch {
      // PowerShell check failed, fall back to basic check
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
