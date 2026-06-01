import { ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { RegistrySettings } from '../services/config-service'
import { RegistryQueryScanner } from './registry-query-scanner'
import { logger } from '../services/logger'

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

    const results: string[] = []
    const scanKeys = this.registrySettings.scanKeys

    for (let i = 0; i < scanKeys.length; i++) {
      if (this.cancelled) break

      const regKey = scanKeys[i]

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: i + 1,
          totalItems: scanKeys.length,
          currentPath: regKey.name,
          percentage: ((i + 1) / scanKeys.length) * 100
        })
      }

      const findings = await this.scanRegistryKey(regKey.path, regKey.name)
      results.push(...findings)
    }

    return this.createSuccessResult(results, startTime)
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
