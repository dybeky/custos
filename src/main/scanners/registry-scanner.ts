import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { RegistrySettings } from '../services/config-service'
import { asyncExec } from '../utils/async-exec'

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

        const findings = await this.scanRegistryKey(regKey.path, regKey.name)
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

  private async scanRegistryKey(path: string, name: string): Promise<string[]> {
    const results: string[] = []

    try {
      // Use reg query command to export registry key
      const output = await asyncExec(`reg query "${path}" /s 2>nul`, {
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer
        timeout: 10000 // 10 second timeout for larger registry keys
      })

      const lines = output.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Skip registry key headers (lines starting with HKEY_)
        if (trimmed.startsWith('HKEY_')) {
          continue
        }

        // Parse reg query format:
        // ValueName    REG_TYPE    Data
        // We only want to search in the Data part, not in ValueName or key paths
        const parts = trimmed.split(/\s{4,}/)

        if (parts.length >= 3) {
          // Format: ValueName    REG_TYPE    Data
          const valueName = parts[0]
          // parts[1] is REG_TYPE (unused)
          const data = parts.slice(2).join(' ') // Data may contain spaces

          // Search keywords only in the data portion
          if (this.keywordMatcher.containsKeyword(data)) {
            results.push(`[${name}] ${valueName} = ${data}`)
          }
          // Also check value name for paths
          else if (valueName.includes('\\') && this.keywordMatcher.containsKeyword(valueName)) {
            results.push(`[${name}] ${valueName} = ${data}`)
          }
        } else if (parts.length === 2) {
          // Format: ValueName    REG_TYPE (no data or empty data)
          // Skip these
        } else if (parts.length === 1 && !trimmed.startsWith('(')) {
          // Single value without type - might be a default value
          if (this.keywordMatcher.containsKeyword(trimmed)) {
            results.push(`[${name}] ${trimmed}`)
          }
        }
      }
    } catch {
      // Registry key doesn't exist or access denied
    }

    return results
  }
}
