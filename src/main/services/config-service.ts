import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

export interface AppTimeouts {
  defaultProcessTimeoutMs: number
  serviceTimeoutMs: number
  powerShellTimeoutMs: number
  exitDelayMs: number
  cleanupDelayMs: number
  uiDelayMs: number
}

export interface ScanSettings {
  appDataScanDepth: number
  windowsScanDepth: number
  programFilesScanDepth: number
  userFoldersScanDepth: number
  recentFilesDays: number
  executableExtensions: string[]
  excludedDirectories: string[]
}

export interface WindowsPaths {
  prefetchPath: string
  windowsPath: string
  programFilesX86: string
  programFiles: string
}

export interface SteamPaths {
  additionalDrives: string[]
  loginUsersRelativePath: string
  unturnedScreenshotsRelativePath: string
}

export interface RegistryScanKey {
  path: string
  name: string
}

export interface RegistrySettings {
  scanKeys: RegistryScanKey[]
}

export interface TelegramBot {
  username: string
  name: string
}

export interface ExternalResourceSettings {
  telegramBots: TelegramBot[]
}

export interface KeywordSettings {
  patterns: string[]
  exactMatch: string[]
}

export interface AppConfig {
  app: {
    timeouts: AppTimeouts
  }
  scanning: ScanSettings
  paths: {
    windows: WindowsPaths
    steam: SteamPaths
  }
  registry: RegistrySettings
  externalResources: ExternalResourceSettings
}

class ConfigService {
  private config: AppConfig | null = null
  private keywords: KeywordSettings | null = null

  private getResourcePath(): string {
    // In production, configs are in resources folder
    if (app.isPackaged) {
      return join(process.resourcesPath, 'resources')
    }

    // In development, try multiple possible locations
    const possiblePaths = [
      join(__dirname, '..', 'config'),
      join(__dirname, '..', '..', 'main', 'config'),
      join(process.cwd(), 'src', 'main', 'config'),
      join(process.cwd(), 'resources')
    ]

    for (const path of possiblePaths) {
      if (existsSync(join(path, 'settings.json'))) {
        return path
      }
    }

    return possiblePaths[0]
  }

  loadConfig(): AppConfig {
    if (this.config) return this.config

    try {
      const configPath = join(this.getResourcePath(), 'settings.json')
      const configContent = readFileSync(configPath, 'utf-8')
      this.config = JSON.parse(configContent) as AppConfig
      return this.config
    } catch (error) {
      console.error('Failed to load config:', error)
      // Return default config
      return this.getDefaultConfig()
    }
  }

  loadKeywords(): KeywordSettings {
    if (this.keywords) return this.keywords

    try {
      const keywordsPath = join(this.getResourcePath(), 'keywords.json')
      const keywordsContent = readFileSync(keywordsPath, 'utf-8')
      this.keywords = JSON.parse(keywordsContent) as KeywordSettings
      return this.keywords
    } catch (error) {
      console.error('Failed to load keywords:', error)
      return { patterns: [], exactMatch: [] }
    }
  }

  private getDefaultConfig(): AppConfig {
    return {
      app: {
        timeouts: {
          defaultProcessTimeoutMs: 10000,
          serviceTimeoutMs: 5000,
          powerShellTimeoutMs: 15000,
          exitDelayMs: 800,
          cleanupDelayMs: 1500,
          uiDelayMs: 500
        }
      },
      scanning: {
        appDataScanDepth: 3,
        windowsScanDepth: 1,
        programFilesScanDepth: 2,
        userFoldersScanDepth: 3,
        recentFilesDays: 7,
        executableExtensions: ['.exe', '.bat', '.cmd', '.ps1'],
        excludedDirectories: []
      },
      paths: {
        windows: {
          prefetchPath: 'C:\\Windows\\Prefetch',
          windowsPath: 'C:\\Windows',
          programFilesX86: 'C:\\Program Files (x86)',
          programFiles: 'C:\\Program Files'
        },
        steam: {
          additionalDrives: ['D:', 'E:', 'F:', 'G:'],
          loginUsersRelativePath: 'Steam\\config\\loginusers.vdf',
          unturnedScreenshotsRelativePath: 'Steam\\steamapps\\common\\Unturned\\Screenshots'
        }
      },
      registry: {
        scanKeys: []
      },
      externalResources: {
        telegramBots: []
      }
    }
  }
}

export const configService = new ConfigService()
