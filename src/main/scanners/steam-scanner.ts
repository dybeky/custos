import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { AppConfig } from '../services/config-service'
import { VdfParser, SteamAccount } from '../services/vdf-parser'

export class SteamScanner extends BaseScanner {
  readonly name = 'Steam Scanner'
  readonly description = 'Scanning Steam accounts and folders'

  private config: AppConfig
  private vdfParser: VdfParser

  constructor(
    keywordMatcher: import('../services/keyword-matcher').KeywordMatcher,
    scanSettings: import('../services/config-service').ScanSettings,
    config: AppConfig
  ) {
    super(keywordMatcher, scanSettings)
    this.config = config
    this.vdfParser = new VdfParser()
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []
      const { steam } = this.config.paths
      const drives = ['C:', ...steam.additionalDrives]

      // Find Steam installation
      const steamPaths: string[] = []

      for (const drive of drives) {
        steamPaths.push(join(drive, 'Program Files (x86)', 'Steam'))
        steamPaths.push(join(drive, 'Program Files', 'Steam'))
        steamPaths.push(join(drive, 'Steam'))
      }

      // Also check user profile
      steamPaths.push(join(homedir(), steam.loginUsersRelativePath).replace('\\config\\loginusers.vdf', ''))

      let steamFound = false
      let accounts: SteamAccount[] = []

      for (let i = 0; i < steamPaths.length; i++) {
        if (this.cancelled) break

        const steamPath = steamPaths[i]
        const loginUsersPath = join(steamPath, 'config', 'loginusers.vdf')

        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: i + 1,
            totalItems: steamPaths.length,
            currentPath: steamPath,
            percentage: ((i + 1) / steamPaths.length) * 100
          })
        }

        if (existsSync(loginUsersPath)) {
          steamFound = true

          try {
            const vdfContent = readFileSync(loginUsersPath, 'utf-8')
            accounts = this.vdfParser.parseSteamAccounts(vdfContent)

            // Add account info to results
            for (const account of accounts) {
              results.push(`[Steam Account] ${account.accountName} (SteamID: ${account.steamId})${account.personaName ? ` - ${account.personaName}` : ''}`)
            }
          } catch {
            // Error parsing VDF file
          }

          // Scan Steam folder for suspicious files
          const steamFindings = this.scanFolder(
            steamPath,
            this.scanSettings.executableExtensions,
            2
          )
          results.push(...steamFindings)

          break // Found Steam, no need to check other paths
        }
      }

      if (!steamFound) {
        results.push('[Steam] Steam installation not found')
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
}
