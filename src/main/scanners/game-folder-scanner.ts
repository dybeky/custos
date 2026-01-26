import { existsSync, readFileSync } from 'fs'
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

  /**
   * Parse Steam's libraryfolders.vdf to get all Steam library paths
   */
  private getSteamLibraryPaths(): string[] {
    const libraryPaths: string[] = []
    const { steam } = this.config.paths
    const drives = ['C:', ...steam.additionalDrives]

    // Common Steam installation paths
    const steamInstallPaths = [
      join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Steam'),
      join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam'),
      ...drives.map(d => join(d, 'Steam')),
      ...drives.map(d => join(d, 'Program Files (x86)', 'Steam')),
      ...drives.map(d => join(d, 'Program Files', 'Steam'))
    ]

    // Find Steam installation and read libraryfolders.vdf
    for (const steamPath of steamInstallPaths) {
      const vdfPath = join(steamPath, 'steamapps', 'libraryfolders.vdf')
      if (existsSync(vdfPath)) {
        try {
          const content = readFileSync(vdfPath, 'utf-8')
          // Parse VDF format - look for "path" entries
          const pathMatches = content.matchAll(/"path"\s+"([^"]+)"/gi)
          for (const match of pathMatches) {
            const libPath = match[1].replace(/\\\\/g, '\\')
            if (existsSync(libPath)) {
              libraryPaths.push(join(libPath, 'steamapps', 'common'))
            }
          }
        } catch {
          // Failed to read VDF
        }

        // Also add the main Steam folder
        const mainCommon = join(steamPath, 'steamapps', 'common')
        if (existsSync(mainCommon) && !libraryPaths.includes(mainCommon)) {
          libraryPaths.push(mainCommon)
        }
        break
      }
    }

    // Fallback: add common paths if VDF parsing didn't find anything
    if (libraryPaths.length === 0) {
      for (const drive of drives) {
        libraryPaths.push(join(drive, 'Program Files (x86)', 'Steam', 'steamapps', 'common'))
        libraryPaths.push(join(drive, 'Program Files', 'Steam', 'steamapps', 'common'))
        libraryPaths.push(join(drive, 'Steam', 'steamapps', 'common'))
        libraryPaths.push(join(drive, 'SteamLibrary', 'steamapps', 'common'))
      }
    }

    return [...new Set(libraryPaths)] // Remove duplicates
  }

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      // Get Steam library paths dynamically from libraryfolders.vdf
      const gameFolders = this.getSteamLibraryPaths()

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

        const findings = await this.scanFolder(
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
