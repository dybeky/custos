import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8'))
const matcher = new KeywordMatcher(flattenKeywords(KeywordSettingsSchema.parse(raw), 'unturned'))

describe('Unturned leads added from public cheat listings', () => {
  it('finds the free "helper" bait repository and the paid aimbot with cheat context', () => {
    expect(matcher.findKeywordInFinding('C:\\Users\\Max\\Downloads\\Unturned-Ai-Helper-2026.zip')).toBeTruthy()
    expect(matcher.findKeywordInFinding('C:\\Users\\Max\\Desktop\\ProAim unturned loader.exe')).toBeTruthy()
  })

  it('does not flag an everyday folder that only looks similar', () => {
    expect(matcher.findKeywordInFinding('C:\\Users\\Max\\Documents\\Pro Aim Photography\\a.jpg')).toBeNull()
  })
})
