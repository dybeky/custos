import { describe, it, expect, beforeAll } from 'vitest'
import en from '../../renderer/i18n/en.json'
import ru from '../../renderer/i18n/ru.json'
import { MANUAL_ITEMS } from '../../shared/manual-items'
import { isAllowedLocalPath, isAllowedExternalUrl, isValidRegistryKey } from './url-policy'
import { parseSteamTarget } from './steam-locator'

const lookup = (json: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], json)

beforeAll(() => {
  // The folders are written with %VARS%; give them values like a real Windows PC has.
  Object.assign(process.env, {
    USERPROFILE: 'C:\\Users\\player',
    APPDATA: 'C:\\Users\\player\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\player\\AppData\\Local',
    TEMP: 'C:\\Users\\player\\AppData\\Local\\Temp',
    ProgramData: 'C:\\ProgramData',
    SystemRoot: 'C:\\Windows'
  })
})

describe('Manual page targets', () => {
  it('every folder and settings page passes the main process path rules', () => {
    for (const item of [...MANUAL_ITEMS.systemTools, ...MANUAL_ITEMS.folders, ...MANUAL_ITEMS.traces]) {
      expect(isAllowedLocalPath(item.target), item.target).toBe(true)
    }
  })

  it('every game and Steam folder is a valid Steam target', () => {
    for (const item of MANUAL_ITEMS.games) expect(parseSteamTarget(item.target), item.target).not.toBeNull()
  })

  it('every registry key is one regedit may be pointed at', () => {
    for (const item of MANUAL_ITEMS.registry) expect(isValidRegistryKey(item.target), item.target).toBe(true)
  })

  it('every link is an allowed https address', () => {
    for (const item of [...MANUAL_ITEMS.telegram, ...MANUAL_ITEMS.resources]) {
      expect(isAllowedExternalUrl(item.target), item.target).toBe(true)
    }
  })

  it('every translated label exists in English and Russian', () => {
    for (const items of Object.values(MANUAL_ITEMS)) {
      for (const item of items as Array<{ label: string; labelKey?: string }>) {
        if (!item.labelKey) continue
        expect(typeof lookup(en, item.labelKey), `en ${item.labelKey}`).toBe('string')
        expect(typeof lookup(ru, item.labelKey), `ru ${item.labelKey}`).toBe('string')
      }
    }
  })

  it('has no two buttons with the same name in one category', () => {
    for (const [id, items] of Object.entries(MANUAL_ITEMS)) {
      const labels = (items as Array<{ label: string }>).map((i) => i.label)
      expect(new Set(labels).size, id).toBe(labels.length)
    }
  })

  it('registry key validation refuses malformed keys', () => {
    for (const bad of ['', '\\HKCU\\x', 'HKCU\\x\\', 'HKCU\\\\x', 'x\\y', 'HKCU\\a;b', 'C:\\Windows']) {
      expect(isValidRegistryKey(bad), bad).toBe(false)
    }
  })
})
