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

describe('migrateSettings (drops legacy theme)', () => {
  it('strips a legacy theme key', () => {
    expect(migrateSettings({ language: 'ru', theme: 'tropical' })).toEqual({ language: 'ru' })
  })
  it('defaults language to en for junk', () => {
    expect(migrateSettings({ theme: 'aurora' })).toEqual({ language: 'en' })
    expect(migrateSettings(null)).toEqual({ language: 'en' })
  })
})
