import { execSync } from 'child_process'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { RegistrySettings } from '../services/config-service'

export class RegistryScanner extends BaseScanner {
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

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
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

        const findings = this.scanRegistryKey(regKey.path, regKey.name)
        results.push(...findings)
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

  private scanRegistryKey(path: string, name: string): string[] {
    const results: string[] = []

    try {
      // Use reg query command to export registry key
      const output = execSync(`reg query "${path}" /s 2>nul`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 10000
      })

      const lines = output.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        if (this.keywordMatcher.containsKeyword(trimmed)) {
          results.push(`[${name}] ${trimmed}`)
        }
      }
    } catch {
      // Registry key doesn't exist or access denied
    }

    return results
  }
}
