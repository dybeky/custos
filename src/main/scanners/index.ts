import { KeywordMatcher } from '../services/keyword-matcher'
import { configService, AppConfig, ScanSettings, RegistrySettings } from '../services/config-service'
import { ScannerInfo } from '../../shared/types'

import { BaseScanner } from './base-scanner'
import { AppDataScanner } from './appdata-scanner'
import { PrefetchScanner } from './prefetch-scanner'
import { RecentFilesScanner } from './recent-files-scanner'
import { GameFolderScanner } from './game-folder-scanner'
import { RegistryScanner } from './registry-scanner'
import { BrowserHistoryScanner } from './browser-history-scanner'
import { ProcessScanner } from './process-scanner'
import { SteamScanner } from './steam-scanner'
import { AmcacheScanner } from './amcache-scanner'
import { BamScanner } from './bam-scanner'
import { ShellbagsScanner } from './shellbags-scanner'
import { VMScanner } from './vm-scanner'

export { BaseScanner } from './base-scanner'

export type ScannerName =
  | 'appdata'
  | 'prefetch'
  | 'recentfiles'
  | 'gamefolder'
  | 'registry'
  | 'browserhistory'
  | 'process'
  | 'steam'
  | 'amcache'
  | 'bam'
  | 'shellbags'
  | 'vm'

export class ScannerFactory {
  private keywordMatcher: KeywordMatcher
  private config: AppConfig
  private scanSettings: ScanSettings
  private registrySettings: RegistrySettings
  private scanners: Map<ScannerName, BaseScanner> = new Map()

  constructor() {
    this.config = configService.loadConfig()
    const keywords = configService.loadKeywords()

    this.keywordMatcher = new KeywordMatcher(keywords)
    this.scanSettings = this.config.scanning
    this.registrySettings = this.config.registry

    this.initializeScanners()
  }

  private initializeScanners(): void {
    this.scanners.set('appdata', new AppDataScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('prefetch', new PrefetchScanner(this.keywordMatcher, this.scanSettings, this.config))
    this.scanners.set('recentfiles', new RecentFilesScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('gamefolder', new GameFolderScanner(this.keywordMatcher, this.scanSettings, this.config))
    this.scanners.set('registry', new RegistryScanner(this.keywordMatcher, this.scanSettings, this.registrySettings))
    this.scanners.set('browserhistory', new BrowserHistoryScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('process', new ProcessScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('steam', new SteamScanner(this.keywordMatcher, this.scanSettings, this.config))
    this.scanners.set('amcache', new AmcacheScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('bam', new BamScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('shellbags', new ShellbagsScanner(this.keywordMatcher, this.scanSettings))
    this.scanners.set('vm', new VMScanner(this.keywordMatcher, this.scanSettings))
  }

  getScanner(name: ScannerName): BaseScanner | undefined {
    return this.scanners.get(name)
  }

  getAllScanners(): BaseScanner[] {
    return Array.from(this.scanners.values())
  }

  getScannerInfo(): ScannerInfo[] {
    return Array.from(this.scanners.entries()).map(([id, scanner]) => ({
      id,
      name: scanner.name,
      description: scanner.description
    }))
  }

  cancelAll(): void {
    for (const scanner of this.scanners.values()) {
      scanner.cancel()
    }
  }

  resetAll(): void {
    for (const scanner of this.scanners.values()) {
      scanner.reset()
    }
  }
}

// Singleton instance
let scannerFactory: ScannerFactory | null = null

export function getScannerFactory(): ScannerFactory {
  if (!scannerFactory) {
    scannerFactory = new ScannerFactory()
  }
  return scannerFactory
}
