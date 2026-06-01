import { join } from 'path'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'

export class AppDataScanner extends BaseScanner {
  readonly name = 'AppData Scanner'
  readonly description = 'Scanning AppData folders by keywords'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const userProfile = homedir()
    const folders = [
      process.env.APPDATA || join(userProfile, 'AppData', 'Roaming'),
      process.env.LOCALAPPDATA || join(userProfile, 'AppData', 'Local'),
      join(userProfile, 'AppData', 'LocalLow')
    ]

    const results: string[] = []

    for (const folder of folders) {
      if (this.cancelled) break
      if (!existsSync(folder)) continue

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: folders.indexOf(folder) + 1,
          totalItems: folders.length,
          currentPath: folder,
          percentage: ((folders.indexOf(folder) + 1) / folders.length) * 100
        })
      }

      const findings = await this.scanFolder(
        folder,
        [], // No extension filtering - search all files
        this.scanSettings.appDataScanDepth
      )
      results.push(...findings)
    }

    return this.createSuccessResult(results, startTime)
  }
}
