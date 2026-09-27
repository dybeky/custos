import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { AppConfig } from '../services/config-service'
import { formatTimestamp } from '../utils/format'

export class PrefetchScanner extends BaseScanner {
  readonly name = 'Prefetch Scanner'
  readonly description = 'Scanning Windows Prefetch folder'

  private config: AppConfig

  constructor(
    keywordMatcher: import('../services/keyword-matcher').KeywordMatcher,
    scanSettings: import('../services/config-service').ScanSettings,
    config: AppConfig
  ) {
    super(keywordMatcher, scanSettings)
    this.config = config
  }

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const prefetchPath = this.config.paths.windows.prefetchPath

    if (!existsSync(prefetchPath)) {
      return this.createSuccessResult([], startTime)
    }

    const results: string[] = []
    const files = await readdir(prefetchPath)

    for (let i = 0; i < files.length; i++) {
      if (this.cancelled) break

      const file = files[i]

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: i + 1,
          totalItems: files.length,
          currentPath: file,
          percentage: ((i + 1) / files.length) * 100
        })
      }

      // Prefetch files have format: PROGRAMNAME-HASH.pf
      // Check the full filename (without .pf extension) for keywords
      const fileNameWithoutExt = file.replace(/\.pf$/i, '')

      if (this.keywordMatcher.containsKeyword(fileNameWithoutExt)) {
        results.push(await this.describe(join(prefetchPath, file)))
      }
    }

    return this.createSuccessResult(results, startTime)
  }

  /**
   * `<path> | last run <time>`. Windows rewrites a prefetch file shortly after
   * each launch, so its last-write time is the program's last run — when a
   * cheat was used is often as telling as the fact that it was.
   */
  private async describe(pfPath: string): Promise<string> {
    try {
      const { mtime } = await stat(pfPath)
      return `${pfPath} | last run ${formatTimestamp(mtime)}`
    } catch {
      return pfPath
    }
  }
}
