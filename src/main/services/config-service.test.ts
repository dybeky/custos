import { describe, it, expect, vi } from 'vitest'

// Mock electron before importing config-service (electron is only used
// to locate packaged resources, not in the pure validation logic).
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp',
    getAppPath: () => '/tmp'
  }
}))

import { AppConfigSchema, KeywordSettingsSchema, KnownHashesSchema } from './config-service'

// ─── A valid, minimal AppConfig object that satisfies AppConfigSchema ─────────
const VALID_CONFIG = {
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
    executableExtensions: ['.exe', '.bat'],
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
      additionalDrives: ['D:', 'E:'],
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

describe('AppConfigSchema (Zod validation)', () => {
  it('accepts a fully valid config object', () => {
    const result = AppConfigSchema.safeParse(VALID_CONFIG)
    expect(result.success).toBe(true)
  })

  it('accepts a config with telegram bots and registry scan keys', () => {
    const extended = {
      ...VALID_CONFIG,
      registry: {
        scanKeys: [{ path: 'HKCU\\Software\\Test', name: 'TestKey' }]
      },
      externalResources: {
        telegramBots: [{ username: 'testbot', name: 'Test Bot' }]
      }
    }
    const result = AppConfigSchema.safeParse(extended)
    expect(result.success).toBe(true)
  })

  it('rejects a config with a negative timeout value', () => {
    const bad = {
      ...VALID_CONFIG,
      app: {
        timeouts: {
          ...VALID_CONFIG.app.timeouts,
          defaultProcessTimeoutMs: -1  // must be positive
        }
      }
    }
    const result = AppConfigSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects a config with a scan depth out of range (> 10)', () => {
    const bad = {
      ...VALID_CONFIG,
      scanning: {
        ...VALID_CONFIG.scanning,
        appDataScanDepth: 99  // max is 10
      }
    }
    const result = AppConfigSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects a config with a scan depth below minimum (< 1)', () => {
    const bad = {
      ...VALID_CONFIG,
      scanning: {
        ...VALID_CONFIG.scanning,
        windowsScanDepth: 0  // min is 1
      }
    }
    const result = AppConfigSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects a config missing required top-level fields', () => {
    const bad = { app: VALID_CONFIG.app } // missing scanning, paths, etc.
    const result = AppConfigSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects a config where recentFilesDays exceeds 365', () => {
    const bad = {
      ...VALID_CONFIG,
      scanning: {
        ...VALID_CONFIG.scanning,
        recentFilesDays: 400
      }
    }
    const result = AppConfigSchema.safeParse(bad)
    expect(result.success).toBe(false)
  })

  it('rejects entirely malformed (non-object) input', () => {
    expect(AppConfigSchema.safeParse(null).success).toBe(false)
    expect(AppConfigSchema.safeParse('string').success).toBe(false)
    expect(AppConfigSchema.safeParse(42).success).toBe(false)
    expect(AppConfigSchema.safeParse([]).success).toBe(false)
  })
})

describe('KeywordSettingsSchema (Zod validation)', () => {
  it('accepts a valid keywords object', () => {
    const result = KeywordSettingsSchema.safeParse({ patterns: ['cheat'], exactMatch: ['aimbot'] })
    expect(result.success).toBe(true)
  })

  it('accepts empty arrays', () => {
    const result = KeywordSettingsSchema.safeParse({ patterns: [], exactMatch: [] })
    expect(result.success).toBe(true)
  })

  it('rejects keywords with missing fields', () => {
    expect(KeywordSettingsSchema.safeParse({ patterns: ['x'] }).success).toBe(false)
    expect(KeywordSettingsSchema.safeParse({}).success).toBe(false)
  })

  it('rejects keywords where patterns is not an array', () => {
    const result = KeywordSettingsSchema.safeParse({ patterns: 'cheat', exactMatch: [] })
    expect(result.success).toBe(false)
  })
})

describe('KnownHashesSchema (Zod validation)', () => {
  it('accepts a valid hashes object', () => {
    const result = KnownHashesSchema.safeParse({
      sha256: ['abc123', 'def456']
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty sha256 array', () => {
    const result = KnownHashesSchema.safeParse({ sha256: [] })
    expect(result.success).toBe(true)
  })

  it('rejects a hashes object without sha256 field', () => {
    const result = KnownHashesSchema.safeParse({ md5: ['abc'] })
    expect(result.success).toBe(false)
  })

  it('rejects when sha256 is not an array', () => {
    const result = KnownHashesSchema.safeParse({ sha256: 'notanarray' })
    expect(result.success).toBe(false)
  })

  it('rejects null input', () => {
    expect(KnownHashesSchema.safeParse(null).success).toBe(false)
  })
})
