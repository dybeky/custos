import { describe, it, expect, vi } from 'vitest'

// Importing ipc-handlers transitively constructs the electron-store-backed
// appStore at module load. Stub electron-store so the import resolves in a
// plain node test (no Electron app available) without touching real disk.
vi.mock('electron-store', () => {
  return {
    default: class {
      private data: Record<string, unknown>
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.data = { ...(opts?.defaults ?? {}) }
      }
      get(key: string): unknown {
        return this.data[key]
      }
      set(key: string, value: unknown): void {
        this.data[key] = value
      }
    }
  }
})

import { migrateSettings } from '../ipc-handlers'

describe('migrateSettings (drops legacy keys)', () => {
  it('strips the legacy theme and language keys', () => {
    expect(migrateSettings({ language: 'ru', theme: 'tropical' })).toEqual({ colorTheme: 'noir' })
  })
  it('defaults for junk input', () => {
    expect(migrateSettings({ theme: 'aurora' })).toEqual({ colorTheme: 'noir' })
    expect(migrateSettings(null)).toEqual({ colorTheme: 'noir' })
  })
  it('drops the retired interface mode, whatever it was', () => {
    expect(migrateSettings({ uiMode: 'modern', colorTheme: 'violet' })).toEqual({ colorTheme: 'violet' })
    expect(migrateSettings({ uiMode: 'classic' })).toEqual({ colorTheme: 'noir' })
  })
  it('keeps a valid color theme and falls back to the default for junk or retired themes', () => {
    expect(migrateSettings({ colorTheme: 'emerald' })).toEqual({ colorTheme: 'emerald' })
    expect(migrateSettings({ colorTheme: 'aurora' })).toEqual({ colorTheme: 'noir' })
  })
})
