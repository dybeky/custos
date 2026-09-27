import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, KnownHashesSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

// Tests run against the REAL bundled signature files, so a bad edit to
// resources/keywords.json or hashes.json fails CI instead of shipping.
const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8'))
const parsed = KeywordSettingsSchema.parse(raw)
const matcher = new KeywordMatcher(flattenKeywords(parsed))

describe('bundled keywords.json', () => {
  it('validates and keeps the per-game sections', () => {
    expect(Object.keys(parsed.games ?? {}).sort()).toEqual(['cs2', 'unturned'])
  })

  it.each([
    'C:\\Users\\p\\Downloads\\Aimware_CS2_loader.exe',
    'C:\\Users\\p\\AppData\\Local\\onetap\\config.cfg',
    'C:\\Users\\p\\Downloads\\ExLoader_Setup.exe',
    'https://plaguecheat.cc/forum/pages/index/',
    'www.gamesense.pub',
    'https://xone.fun/en/products/7-cs2-x1-internal',
    'https://ancientick.com/en/product.html',
    'C:\\Users\\p\\Downloads\\Unturned-hack-main\\loader.exe'
  ])('detects confirmed cheat artifact %s', (v) => {
    expect(matcher.containsKeyword(v)).toBe(true)
  })

  it.each([
    'C:\\Program Files\\SteelSeries\\GG\\apps\\engine\\GameSense\\gamesense.dll',
    'C:\\Windows\\System32\\drivers\\xone.sys',
    'C:\\Games\\A Plague Tale Requiem\\APlagueTaleRequiem.exe',
    'https://store.steampowered.com/app/1182900/A_Plague_Tale_Requiem/',
    'C:\\Games\\Osiris New Dawn\\Osiris.exe',
    'https://www.skeetshooting.org/',
    'C:\\SteamLibrary\\steamapps\\common\\Unturned\\Unturned.exe'
  ])('stays quiet on look-alike legitimate artifact %s', (v) => {
    expect(matcher.containsKeyword(v)).toBe(false)
  })

  it('flattening de-duplicates case-insensitively', () => {
    const f = flattenKeywords({ patterns: ['Aimware'], exactMatch: [], games: { cs2: { patterns: ['aimware'], exactMatch: [], domains: [] } } })
    expect(f.patterns).toEqual(['aimware'])
  })
})

describe('bundled hashes.json', () => {
  it('validates (every entry must be a real SHA-256 with a source)', () => {
    const hashes = KnownHashesSchema.parse(JSON.parse(readFileSync(join(process.cwd(), 'resources/hashes.json'), 'utf8')))
    expect(Array.isArray(hashes.sha256)).toBe(true)
  })

  it('rejects malformed digests and entries without a source', () => {
    expect(KnownHashesSchema.safeParse({ sha256: ['abc'] }).success).toBe(false)
    expect(KnownHashesSchema.safeParse({ sha256: [], entries: [{ sha256: 'a'.repeat(64), name: 'x', source: '' }] }).success).toBe(false)
    expect(KnownHashesSchema.safeParse({ sha256: [], entries: [{ sha256: 'A'.repeat(64), name: 'x', source: 'hashed locally' }] }).success).toBe(true)
  })
})
