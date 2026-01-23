import { existsSync } from 'fs'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { AppConfig } from '../services/config-service'

export class GameFolderScanner extends BaseScanner {
  readonly name = 'Game Folder Scanner'
  readonly description = 'Scanning game installation directories'

  private config: AppConfig

  constructor(
    keywordMatcher: import('../services/keyword-matcher').KeywordMatcher,
    scanSettings: import('../services/config-service').ScanSettings,
    config: AppConfig
  ) {
    super(keywordMatcher, scanSettings)
    this.config = config
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const { steam } = this.config.paths
      const drives = ['C:', ...steam.additionalDrives]

      // Build list of possible game folders
      const gameFolders: string[] = []

      for (const drive of drives) {
        // Steam games folder
        gameFolders.push(join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'common'))
        gameFolders.push(join(drive, 'Program Files', 'Steam', 'steamapps', 'common'))
        gameFolders.push(join(drive, 'Steam', 'steamapps', 'common'))
        gameFolders.push(join(drive, 'SteamLibrary', 'steamapps', 'common'))

        // Unturned specific folder
        gameFolders.push(join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'Unturned'))
        gameFolders.push(join(drive, 'SteamLibrary', 'steamapps', 'common', 'Unturned'))
      }

      const results: string[] = []
      let processedCount = 0
      const existingFolders = gameFolders.filter(f => existsSync(f))

      for (const folder of existingFolders) {
        if (this.cancelled) break

        processedCount++
        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: processedCount,
            totalItems: existingFolders.length,
            currentPath: folder,
            percentage: (processedCount / existingFolders.length) * 100
          })
        }

        const findings = this.scanFolder(
          folder,
          this.scanSettings.executableExtensions,
          this.scanSettings.userFoldersScanDepth
        )
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
}
