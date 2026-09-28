import { readFileSync } from 'fs'
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

/** Per-game additions: names, exact basenames and cheat-shop/provider domains. */
const GameKeywordsSchema = z.object({
  patterns: z.array(z.string()).default([]),
  exactMatch: z.array(z.string()).default([]),
  /** Domains only match as whole domains — safe for brands whose name is a common word. */
  domains: z.array(z.string()).default([])
})

const KeywordSettingsSchema = z.object({
  patterns: z.array(z.string()),
  exactMatch: z.array(z.string()),
  /**
   * Patterns that are also everyday words ("midnight", "titanium"). They only
   * count on an exact file name or next to a cheat-context word — see
   * KeywordMatcher.qualifies.
   */
  ambiguous: z.array(z.string()).default([]),
  games: z.record(z.string(), GameKeywordsSchema).optional()
})

const Sha256Schema = z.string().regex(/^[0-9a-fA-F]{64}$/, 'not a SHA-256 hex digest')

/**
 * Known cheat file hashes. A match is treated as a VERIFIED content match and
 * drives a Critical verdict on its own, so every entry must be a real,
 * confirmed hash: `entries` carry where each one came from.
 */
const KnownHashesSchema = z.object({
  sha256: z.array(Sha256Schema),
  entries: z.array(z.object({
    sha256: Sha256Schema,
    name: z.string(),
    game: z.string().optional(),
    /** Where the hash was confirmed (URL or report) — required for traceability. */
    source: z.string().min(1)
  })).default([])
})

/**
 * Flatten the per-game sections into one matcher configuration. Custos checks
 * a PC as a whole: a CS2 cheat found during an Unturned check is still a lead.
 */
export function flattenKeywords(k: z.input<typeof KeywordSettingsSchema>): KeywordSettings {
  const patterns = [...k.patterns]
  const exactMatch = [...k.exactMatch]
  for (const g of Object.values(k.games ?? {})) {
    patterns.push(...(g.patterns ?? []), ...(g.domains ?? []))
    exactMatch.push(...(g.exactMatch ?? []))
  }
  const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()]
  return { patterns: uniq(patterns), exactMatch: uniq(exactMatch), ambiguous: uniq(k.ambiguous ?? []) }
}

// Export schemas for testing
export { AppConfigSchema, KeywordSettingsSchema, KnownHashesSchema }

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
export type KeywordSettings = { patterns: string[]; exactMatch: string[]; ambiguous?: string[] }
export type KnownHashes = z.infer<typeof KnownHashesSchema>

// ── Desktop auth config (kill switch + web base URL) ──────────────────────────
const AuthConfigSchema = z.object({
  enabled: z.boolean(),
  webBaseUrl: z.string().url()
})
export { AuthConfigSchema }
export type AuthConfig = z.infer<typeof AuthConfigSchema>

const DEFAULT_AUTH_CONFIG: AuthConfig = { enabled: true, webBaseUrl: 'https://97437.dev' }

/** Apply WEB_BASE_URL / DESKTOP_AUTH_ENABLED env overrides on top of a file block. */
export function resolveAuthConfig(fileBlock: AuthConfig): AuthConfig {
  const webBaseUrl = process.env.WEB_BASE_URL || fileBlock.webBaseUrl
  const enabled = process.env.DESKTOP_AUTH_ENABLED === 'false' ? false : fileBlock.enabled
  return { enabled, webBaseUrl }
}

class ConfigService {
  private config: AppConfig | null = null
  private keywords: KeywordSettings | null = null
  private knownHashes: string[] | null = null
  private authConfig: AuthConfig | null = null

  private getResourcePath(): string {
    // In production, configs are in resources folder
    if (app.isPackaged) {
      return join(process.resourcesPath, 'resources')
    }

    // In development, use the project resources/ directory as single source of truth
    return join(process.cwd(), 'resources')
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
        this.keywords = flattenKeywords(result.data)
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

  loadKnownHashes(): string[] {
    if (this.knownHashes) return this.knownHashes

    try {
      const hashesPath = join(this.getResourcePath(), 'hashes.json')
      const hashesContent = readFileSync(hashesPath, 'utf-8')
      const parsed = JSON.parse(hashesContent)

      const result = KnownHashesSchema.safeParse(parsed)
      if (result.success) {
        this.knownHashes = [...new Set([...result.data.sha256, ...result.data.entries.map(e => e.sha256)].map(h => h.toLowerCase()))]
        return this.knownHashes
      } else {
        logger.error('Known hashes validation failed:', result.error.format())
        return []
      }
    } catch (error) {
      logger.error('Failed to load known hashes:', error)
      return []
    }
  }

  loadAuthConfig(): AuthConfig {
    if (this.authConfig) return this.authConfig
    let fileBlock = DEFAULT_AUTH_CONFIG
    try {
      const configPath = join(this.getResourcePath(), 'settings.json')
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      const result = AuthConfigSchema.safeParse(parsed.auth)
      if (result.success) fileBlock = result.data
      else logger.warn('Auth config block missing/invalid; using defaults')
    } catch (error) {
      logger.warn('Failed to read auth config; using defaults', { error: String(error) })
    }
    this.authConfig = resolveAuthConfig(fileBlock)
    return this.authConfig
  }

  /**
   * Pinned Ed25519 public key (base64 SPKI) for signature bundles downloaded
   * from the site — settings.json `signatures.publicKey`. Empty = updates off.
   */
  loadSignaturePublicKey(): string {
    try {
      const parsed = JSON.parse(readFileSync(join(this.getResourcePath(), 'settings.json'), 'utf-8'))
      const key = parsed?.signatures?.publicKey
      return typeof key === 'string' && /^[A-Za-z0-9+/=]{40,200}$/.test(key.trim()) ? key.trim() : ''
    } catch {
      return ''
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
          prefetchPath: `${process.env.SystemRoot ?? 'C:\\Windows'}\\Prefetch`,
          windowsPath: process.env.SystemRoot ?? 'C:\\Windows',
          programFilesX86: process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
          programFiles: process.env.ProgramFiles ?? 'C:\\Program Files'
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
