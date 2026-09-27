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
    expect(migrateSettings({ language: 'ru', theme: 'tropical' })).toEqual({ uiMode: 'classic' })
  })
  it('defaults for junk input', () => {
    expect(migrateSettings({ theme: 'aurora' })).toEqual({ uiMode: 'classic' })
    expect(migrateSettings(null)).toEqual({ uiMode: 'classic' })
  })
  it('keeps a valid interface mode and rejects junk', () => {
    expect(migrateSettings({ language: 'en', uiMode: 'modern' })).toEqual({ uiMode: 'modern' })
    expect(migrateSettings({ uiMode: 'neon' })).toEqual({ uiMode: 'classic' })
  })
})
