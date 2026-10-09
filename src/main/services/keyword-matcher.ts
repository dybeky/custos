import { win32 } from 'path'
import { KeywordSettings } from './config-service'

/**
 * Words that put an ambiguous keyword into a cheat context. Same boundary
 * rules as the keywords themselves, so "hackathon" or "espresso" don't count.
 */
const CHEAT_CONTEXT = new RegExp(
  '(?<![a-z0-9])(' +
    [
      'cheats?', 'cheating', 'hacks?', 'hacking', 'hacked', 'aim-?bot', 'wall-?hack', 'trigger-?bot', 'esp',
      'inject(or|ed|ion)?', 'loader', 'spoofer', 'hwid', 'unturned', 'cs2', 'csgo', 'counter-strike',
      'mod-?menu', 'undetected', 'bypass', 'cracked'
    ].join('|') +
    ')(?![a-z])'
)

/**
 * The part of `text` that may give a keyword at `index` its cheat context. For
 * a Windows path: the folder or file name holding the keyword plus the file
 * name. URLs and titles are read whole.
 */
function contextAround(text: string, index: number, length: number): string {
  if (!text.includes('\\')) return text
  const parts = text.split(/[\\/]/).filter(Boolean)
  const start = Math.max(text.lastIndexOf('\\', index), text.lastIndexOf('/', index)) + 1
  const nextSep = text.slice(index + length).search(/[\\/]/)
  const own = text.slice(start, nextSep === -1 ? text.length : index + length + nextSep)
  const last = parts[parts.length - 1] ?? ''
  return own === last ? own : `${own} ${last}`
}

export class KeywordMatcher {
  private patterns: string[]
  private patternsLower: string[]
  private exactMatch: Set<string>
  /** Keywords that are also everyday words (see keywords.json → ambiguous). */
  private ambiguous: Set<string>
  private compiledPattern: RegExp | null = null
  private patternIndexMap: Map<string, number> = new Map()

  constructor(settings: KeywordSettings) {
    this.patterns = settings.patterns || []
    this.patternsLower = this.patterns.map(k => k.toLowerCase())
    this.exactMatch = new Set(
      (settings.exactMatch || []).map(e => e.toLowerCase())
    )
    this.ambiguous = new Set((settings.ambiguous || []).map(e => e.toLowerCase()))

    // Compile all patterns into a single regex for O(1) matching
    if (this.patternsLower.length > 0) {
      // Escape regex special characters in patterns
      const escaped = this.patternsLower.map(p =>
        p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      // Build pattern index map for findKeyword
      escaped.forEach((p, i) => this.patternIndexMap.set(p, i))

      // Word boundaries: a keyword must start after a non-alphanumeric char and
      // end before one — so "cheater" / "TitaniumBackup" do not match. A run of
      // trailing DIGITS is still allowed ("Aimbot2.exe", "Fecurity64.dll",
      // "undead2024"), since version/arch suffixes are the most common way a
      // renamed cheat build dodges an exact-word match; digits followed by a
      // letter ("aimbot2x") still do not match. Global, so findKeyword can
      // step past an ambiguous match that has no cheat context.
      this.compiledPattern = new RegExp(
        `(?<![a-zA-Z0-9])(${escaped.join('|')})(?!\\d*[a-zA-Z])`,
        'gi'
      )
    }
  }

  containsKeyword(text: string): boolean {
    return this.findKeyword(text) !== null
  }

  private getFileNameWithoutExtension(filePath: string): string {
    // Custos always scans Windows paths, so use win32 semantics regardless of
    // the host OS running the tests — win32.basename splits on both \ and /.
    const fileName = win32.basename(filePath)
    const lastDot = fileName.lastIndexOf('.')
    return lastDot > 0 ? fileName.substring(0, lastDot) : fileName
  }

  // Alias for compatibility
  containsKeywordWithWhitelist(text: string, _path?: string): boolean {
    return this.containsKeyword(text)
  }

  /**
   * An everyday-word keyword ("midnight", "titanium") only counts when the
   * file is named exactly that ("Midnight.exe", "titanium2.dll") or the text
   * also says what it is ("Midnight CS2 cheat loader"). A song title or a
   * page about ancient Rome is not a lead.
   *
   * In a path the context must sit in the keyword's own folder/file name or
   * in the file name: a folder named after the game being checked ("…\\Unturned\\Maps\\Midnight\\…") says nothing about the item.
   */
  private qualifies(keywordLower: string, textLower: string, baseName: string, index: number): boolean {
    if (!this.ambiguous.has(keywordLower)) return true
    if (new RegExp(`^${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d*$`).test(baseName)) return true
    return CHEAT_CONTEXT.test(contextAround(textLower, index, keywordLower.length))
  }

  findKeyword(text: string): string | null {
    if (!text) return null

    const textLower = text.toLowerCase()
    const baseName = this.getFileNameWithoutExtension(textLower)

    if (this.exactMatch.has(baseName)) {
      return baseName
    }

    if (this.compiledPattern) {
      for (const match of textLower.matchAll(this.compiledPattern)) {
        const matchedLower = match[1]
        if (!this.qualifies(matchedLower, textLower, baseName, match.index ?? 0)) continue
        // Use O(1) lookup with patternIndexMap instead of O(n) loop
        const escapedMatch = matchedLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const index = this.patternIndexMap.get(escapedMatch)
        return index !== undefined ? this.patterns[index] : match[1]
      }
    }

    return null
  }

  getKeywords(): readonly string[] {
    return this.patterns
  }
}
