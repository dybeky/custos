import { describe, it, expect } from 'vitest'
import { KeywordMatcher } from './keyword-matcher'

describe('KeywordMatcher', () => {
  describe('containsKeyword', () => {
    it('should match exact patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat', 'hack', 'aimbot'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('this contains cheat word')).toBe(true)
      expect(matcher.containsKeyword('hack tool')).toBe(true)
      expect(matcher.containsKeyword('aimbot.exe')).toBe(true)
    })

    it('should not match partial words', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      // Should not match 'cheat' inside 'cheater' due to word boundary
      expect(matcher.containsKeyword('cheater')).toBe(false)
      expect(matcher.containsKeyword('uncheatable')).toBe(false)
    })

    it('should be case insensitive', () => {
      const matcher = new KeywordMatcher({
        patterns: ['Cheat', 'HACK'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('CHEAT')).toBe(true)
      expect(matcher.containsKeyword('hack')).toBe(true)
      expect(matcher.containsKeyword('HaCk')).toBe(true)
    })

    it('should handle exact match patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: ['x22cheats', 'aimware']
      })

      expect(matcher.containsKeyword('C:\\Games\\x22cheats.exe')).toBe(true)
      expect(matcher.containsKeyword('aimware.dll')).toBe(true)
      expect(matcher.containsKeyword('x22cheats_modified.exe')).toBe(false)
    })

    it('should return false for empty input', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      expect(matcher.containsKeyword('')).toBe(false)
      expect(matcher.containsKeyword(null as unknown as string)).toBe(false)
    })

    it('should handle empty patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: []
      })

      expect(matcher.containsKeyword('anything')).toBe(false)
    })
  })

  describe('findKeyword', () => {
    it('should return the matched keyword', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat', 'hack', 'aimbot'],
        exactMatch: []
      })

      expect(matcher.findKeyword('using cheat software')).toBe('cheat')
      expect(matcher.findKeyword('hack tool detected')).toBe('hack')
    })

    it('should return null when no match', () => {
      const matcher = new KeywordMatcher({
        patterns: ['cheat'],
        exactMatch: []
      })

      expect(matcher.findKeyword('legitimate software')).toBe(null)
    })

    it('should return original case pattern', () => {
      const matcher = new KeywordMatcher({
        patterns: ['AimBot', 'WallHack'],
        exactMatch: []
      })

      expect(matcher.findKeyword('detected aimbot')).toBe('AimBot')
      expect(matcher.findKeyword('WALLHACK found')).toBe('WallHack')
    })

    it('should match exact match patterns', () => {
      const matcher = new KeywordMatcher({
        patterns: [],
        exactMatch: ['x22cheats']
      })

      expect(matcher.findKeyword('x22cheats.exe')).toBe('x22cheats')
    })
  })

  describe('getKeywords', () => {
    it('should return all patterns', () => {
      const patterns = ['cheat', 'hack', 'aimbot']
      const matcher = new KeywordMatcher({
        patterns,
        exactMatch: []
      })

      expect(matcher.getKeywords()).toEqual(patterns)
    })
  })
})
