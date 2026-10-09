import { describe, it, expect } from 'vitest'
import { shellItemStrings } from './shellbags-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

// A file-entry shell item: 8.3 short name, then the UTF-16LE long name.
const ITEM = '310000000000554E444541447E31000000EFBE55006E00640065006100640020004300680065006100740073002000760032000000'

describe('shellItemStrings', () => {
  it('reads the folder names Explorer stores inside a BagMRU value', () => {
    const names = shellItemStrings(ITEM)
    expect(names).toContain('Undead Cheats v2')
    expect(names).toContain('UNDEAD~1')
  })

  it('reads Cyrillic folder names', () => {
    const hex = '0000' + Buffer.from('Читы undead', 'utf16le').toString('hex') + '0000'
    expect(shellItemStrings(hex)).toContain('Читы undead')
  })

  it('makes the keyword reachable for the matcher, and ignores noise', () => {
    const m = new KeywordMatcher({ patterns: ['undead'], exactMatch: [], ambiguous: [] })
    expect(shellItemStrings(ITEM).some((n) => m.containsKeyword(n))).toBe(true)
    // Binary noise may decode to short junk; it never reaches a keyword.
    expect(shellItemStrings('0011223344556677').some((n) => m.containsKeyword(n))).toBe(false)
    expect(shellItemStrings('zz')).toEqual([])
  })
})
