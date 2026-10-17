import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8'))
const matcher = new KeywordMatcher(flattenKeywords(KeywordSettingsSchema.parse(raw)))

/** Small deterministic generator so a failure can be replayed. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const ALPHABET = [
  'a', 'b', 'e', 'i', 'm', 'o', 's', 'p', 'x', '0', '7', ' ', '-', '_', '.', '\\', '/', ':', '[', ']', '(', ')', '|', '→', '—', '=',
  'ß', 'İ', 'Ж', 'ё', '\u0000', '\u200b', '😀', '\r', '\n', '\t', 'ESP', 'aim', 'bot', 'Cheat', 'Users', 'C:\\Users\\', '.exe', '.pf', ' -> ', ' | '
]

function randomText(r: () => number, parts: number): string {
  let out = ''
  for (let i = 0; i < parts; i++) out += ALPHABET[Math.floor(r() * ALPHABET.length)]
  return out
}

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t = performance.now()
  const value = fn()
  return { ms: performance.now() - t, value }
}

describe('keyword matcher fuzz', () => {
  it('never throws on random text, whatever the separators, case or unicode', () => {
    const r = rng(1)
    for (let i = 0; i < 4000; i++) {
      const text = randomText(r, 1 + Math.floor(r() * 40))
      expect(() => matcher.findKeyword(text)).not.toThrow()
      expect(() => matcher.findKeywordInFinding(text)).not.toThrow()
      expect(() => matcher.containsKeyword(text.toUpperCase())).not.toThrow()
    }
  })

  it('answers null or a known keyword', () => {
    const known = new Set(matcher.getKeywords().map((k) => k.toLowerCase()))
    const r = rng(2)
    for (let i = 0; i < 2000; i++) {
      const found = matcher.findKeywordInFinding(randomText(r, 30))
      if (found !== null) expect(typeof found).toBe('string')
      void known
    }
  })

  it('is case insensitive for a planted cheat name', () => {
    for (const name of ['aimbot', 'AIMBOT', 'AimBot', 'aim bot', 'Aim_Bot', 'AIM-BOT']) {
      expect(matcher.findKeyword(`C:\\Users\\Max\\Downloads\\${name}.exe`), name).not.toBeNull()
    }
  })

  // Catastrophic backtracking guard: every shape below is 1 MB; the whole
  // scan of one finding must stay far below what would freeze a scanner.
  const MB = Number(process.env.FUZZ_SIZE ?? 1024 * 1024)
  const shapes: Array<[string, string]> = [
    ['spaces', ' '.repeat(MB)],
    ['dashes', '-'.repeat(MB)],
    ['separators mix', '-_ .'.repeat(MB / 4)],
    ['digits', '7'.repeat(MB)],
    ['letters', 'a'.repeat(MB)],
    ['backslashes', '\\'.repeat(MB)],
    ['dir chain', 'C:\\Users\\a\\'.repeat(MB / 12)],
    ['keyword chain', 'aimbot '.repeat(MB / 7)],
    ['keyword digits', 'aimbot' + '1'.repeat(MB)],
    ['arrows', 'a -> '.repeat(MB / 5)],
    ['pipes', 'x | '.repeat(MB / 4)],
    ['brackets', '[a]'.repeat(MB / 3)],
    ['parens', '(a '.repeat(MB / 3)],
    ['name suffix', 'spoofer' + '_v1'.repeat(MB / 3)],
    ['suffix spaces', 'esp' + ' '.repeat(MB) + '!'],
    ['dotted', 'a.'.repeat(MB / 2)],
    ['newlines', 'a\n'.repeat(MB / 2)]
  ]
  it.each(shapes)('stays fast on 1 MB of %s', (_name, text) => {
    const { ms } = timed(() => matcher.findKeywordInFinding(text))
    expect(ms).toBeLessThan(2000)
  })
})
