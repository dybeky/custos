import { ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { RegistrySettings } from '../services/config-service'
import { RegistryQueryScanner } from './registry-query-scanner'
import { logger } from '../services/logger'
import { mapWithConcurrency } from '../utils/concurrency'

/** `reg query` calls in flight at once; the global process limiter still caps all scanners together. */
const REG_PARALLEL = 4

export class RegistryScanner extends RegistryQueryScanner {
  readonly name = 'Registry Scanner'
  readonly description = 'Registry search by keywords (MuiCache, AppSwitched, ShowJumpView)'

  private registrySettings: RegistrySettings

  constructor(
    keywordMatcher: import('../services/keyword-matcher').KeywordMatcher,
    scanSettings: import('../services/config-service').ScanSettings,
    registrySettings: RegistrySettings
  ) {
    super(keywordMatcher, scanSettings)
    this.registrySettings = registrySettings
  }

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const scanKeys = this.registrySettings.scanKeys
    let done = 0
    let timedOut = false

    // Each `reg query` costs a process start; on a PC where that takes seconds, ten in a row
    // outlast the scanner's time limit. A few at a time keeps the order of the findings.
    const perKey = await mapWithConcurrency(scanKeys, REG_PARALLEL, async (regKey) => {
      if (this.cancelled) return []
      if (this.outOfTime()) { timedOut = true; return [] }
      const findings = await this.scanRegistryKey(regKey.path, regKey.name)
      events?.onProgress?.({
        scannerName: this.name,
        currentItem: ++done,
        totalItems: scanKeys.length,
        currentPath: regKey.name,
        percentage: (done / scanKeys.length) * 100
      })
      return findings
    })

    return this.createSuccessResult(perKey.flat(), startTime, timedOut ? 'Some registry keys were not read (time limit reached)' : undefined)
  }

  private async scanRegistryKey(path: string, name: string): Promise<string[]> {
    try {
      return await this.queryRegistry(path, name)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      if (errorMsg.includes('Access is denied') || errorMsg.includes('access denied')) {
        logger.debug('Registry access denied', { path, name, error: errorMsg })
        return [`[${name}] Access denied - run as administrator for full access`]
      } else if (errorMsg.includes('not found') || errorMsg.includes('not exist')) {
        logger.debug('Registry key not found', { path, name })
        return []
      } else {
        logger.debug('Registry scan error', { path, name, error: errorMsg })
        return []
      }
    }
  }
}
