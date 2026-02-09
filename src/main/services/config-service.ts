import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { z } from 'zod'
import { logger } from './logger'

// Zod schemas for validation
const AppTimeoutsSchema = z.object({
  defaultProcessTimeoutMs: z.number().positive(),
  serviceTimeoutMs: z.number().positive(),
  powerShellTimeoutMs: z.number().positive(),
  exitDelayMs: z.number().nonnegative(),
  cleanupDelayMs: z.number().nonnegative(),
  uiDelayMs: z.number().nonnegative()
})

const ScanSettingsSchema = z.object({
  appDataScanDepth: z.number().int().min(1).max(10),
  windowsScanDepth: z.number().int().min(1).max(10),
  programFilesScanDepth: z.number().int().min(1).max(10),
  userFoldersScanDepth: z.number().int().min(1).max(10),
  recentFilesDays: z.number().int().min(1).max(365),
  executableExtensions: z.array(z.string()),
  excludedDirectories: z.array(z.string())
})

const WindowsPathsSchema = z.object({
  prefetchPath: z.string(),
  windowsPath: z.string(),
  programFilesX86: z.string(),
  programFiles: z.string()
})

const SteamPathsSchema = z.object({
  additionalDrives: z.array(z.string()),
  loginUsersRelativePath: z.string(),
  unturnedScreenshotsRelativePath: z.string()
})

const RegistryScanKeySchema = z.object({
  path: z.string(),
  name: z.string()
})

const RegistrySettingsSchema = z.object({
  scanKeys: z.array(RegistryScanKeySchema)
})

const TelegramBotSchema = z.object({
  username: z.string(),
  name: z.string()
})

const ExternalResourceSettingsSchema = z.object({
  telegramBots: z.array(TelegramBotSchema)
})

const AppConfigSchema = z.object({
  app: z.object({
    timeouts: AppTimeoutsSchema
  }),
  scanning: ScanSettingsSchema,
  paths: z.object({
    windows: WindowsPathsSchema,
    steam: SteamPathsSchema
  }),
  registry: RegistrySettingsSchema,
  externalResources: ExternalResourceSettingsSchema
})

const KeywordSettingsSchema = z.object({
  patterns: z.array(z.string()),
  exactMatch: z.array(z.string())
})

// Export types inferred from schemas
export type AppTimeouts = z.infer<typeof AppTimeoutsSchema>
export type ScanSettings = z.infer<typeof ScanSettingsSchema>
export type WindowsPaths = z.infer<typeof WindowsPathsSchema>
export type SteamPaths = z.infer<typeof SteamPathsSchema>
export type RegistryScanKey = z.infer<typeof RegistryScanKeySchema>
export type RegistrySettings = z.infer<typeof RegistrySettingsSchema>
export type TelegramBot = z.infer<typeof TelegramBotSchema>
export type ExternalResourceSettings = z.infer<typeof ExternalResourceSettingsSchema>
export type AppConfig = z.infer<typeof AppConfigSchema>
export type KeywordSettings = z.infer<typeof KeywordSettingsSchema>

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
      const parsed = JSON.parse(configContent)

      // Validate with Zod
      const result = AppConfigSchema.safeParse(parsed)
      if (result.success) {
        this.config = result.data
        return this.config
      } else {
        logger.error('Config validation failed:', result.error.format())
        return this.getDefaultConfig()
      }
    } catch (error) {
      logger.error('Failed to load config:', error)
      return this.getDefaultConfig()
    }
  }

  loadKeywords(): KeywordSettings {
    if (this.keywords) return this.keywords

    try {
      const keywordsPath = join(this.getResourcePath(), 'keywords.json')
      const keywordsContent = readFileSync(keywordsPath, 'utf-8')
      const parsed = JSON.parse(keywordsContent)

      // Validate with Zod
      const result = KeywordSettingsSchema.safeParse(parsed)
      if (result.success) {
        this.keywords = result.data
        return this.keywords
      } else {
        logger.error('Keywords validation failed:', result.error.format())
        return { patterns: [], exactMatch: [] }
      }
    } catch (error) {
      logger.error('Failed to load keywords:', error)
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
