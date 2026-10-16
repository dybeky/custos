import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8'))
const matcher = new KeywordMatcher(flattenKeywords(KeywordSettingsSchema.parse(raw)))

describe('compound cheat names under other separators', () => {
  it.each([
    'C:\\Users\\Max\\Downloads\\Aim_Bot.exe',
    'C:\\Users\\Max\\Downloads\\Aim Bot v2.exe',
    'C:\\Users\\Max\\Downloads\\wall-hack.dll',
    'C:\\Users\\Max\\Downloads\\Trigger Bot.exe',
    'C:\\Users\\Max\\Downloads\\no_recoil.exe',
    'C:\\Users\\Max\\Downloads\\Speed Hack.exe',
    'C:\\Users\\Max\\Downloads\\Xenos Injector.exe',
    'C:\\Users\\Max\\Downloads\\Mega Dumper.exe'
  ])('flags %s', (v) => {
    expect(matcher.findKeywordInFinding(v)).not.toBeNull()
  })

  it('reports the same signature whatever the spelling, so they correlate', () => {
    expect(matcher.findKeyword('Aim Bot.exe')).toBe('aimbot')
    expect(matcher.findKeyword('aimbot.exe')).toBe('aimbot')
    expect(matcher.findKeyword('Cheat Engine 7.5')).toBe(matcher.findKeyword('cheatengine.exe'))
  })
})

describe('exact cheat names re-downloaded or copied', () => {
  it.each([
    'C:\\Users\\Max\\Downloads\\Spoofer (1).exe',
    'C:\\Users\\Max\\Downloads\\spoofer - Copy.exe',
    'C:\\Users\\Max\\Downloads\\Spoofer - Copy (2).exe',
    'C:\\Users\\Max\\Downloads\\esp (3).exe'
  ])('flags %s', (v) => {
    expect(matcher.findKeywordInFinding(v)).not.toBeNull()
  })
})

describe('account names in every path form', () => {
  it('does not take a profile folder named like a cheat for a lead (forward slashes)', () => {
    expect(matcher.findKeyword('file:///C:/Users/Mason/Downloads/hack the box.pdf')).toBeNull()
  })

  it('does not take a profile folder named like a cheat for a lead (BAM volume path)', () => {
    expect(matcher.findKeyword('\\Device\\HarddiskVolume3\\Users\\Mason\\Downloads\\hack the box.pdf')).toBeNull()
  })

  it('still reads the rest of the path', () => {
    expect(matcher.findKeyword('C:/Users/Mason/Downloads/aimbot.exe')).toBe('aimbot')
  })
})
