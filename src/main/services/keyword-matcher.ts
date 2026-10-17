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

/** Version, build or package words a renamed cheat tacks on: "spoofer_v2", "esp-setup". */
const NAME_SUFFIX = /(?:[-_ .]+(?:v?\d+(?:[._]\d+)*|x64|x86|win64|win32|setup|installer|loader|crack(?:ed)?|free|new|final|copy|копия)|\s*\(\d+\))$/

/** A keyword is spelled with or without its separators: "cheat engine", "cheat-engine", "cheatengine". */
const squash = (s: string): string => s.replace(/[-_ ]/g, '')

/**
 * Where the account name sits in `C:\Users\<name>`, `C:/Users/<name>` (browser
 * file links) or `\Device\HarddiskVolume3\Users\<name>` (BAM): a person's name, not a lead.
 */
function profileSpan(textLower: string): [number, number] | null {
  const m = /(?:[a-z]:|\\device\\harddiskvolume\d+)[\\/]+users[\\/]+([^\\/]+)/.exec(textLower)
  return m ? [m.index + m[0].length - m[1].length, m.index + m[0].length] : null
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
    this.ambiguous = new Set((settings.ambiguous || []).map(e => squash(e.toLowerCase())))

    // Compile all patterns into a single regex for O(1) matching
    if (this.patternsLower.length > 0) {
      // Escape regex special characters in patterns
      const escaped = this.patternsLower.map(p =>
        p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_ ]+/g, '[-_ ]?')
      )
      // Build pattern index map for findKeyword, keyed without separators
      // First spelling wins: "aimbot" and "aim-bot" are one signature.
      this.patternsLower.forEach((p, i) => {
        if (!this.patternIndexMap.has(squash(p))) this.patternIndexMap.set(squash(p), i)
      })

      // Word boundaries: a keyword must start after a non-alphanumeric char and
      // end before one — so "cheater" / "TitaniumBackup" do not match. A run of
      // trailing DIGITS is still allowed ("Aimbot2.exe", "Fecurity64.dll",
      // "undead2024"), since version/arch suffixes are the most common way a
      // renamed cheat build dodges an exact-word match; digits followed by a
      // letter ("aimbot2x") still do not match. Global, so findKeyword can
      // step past an ambiguous match that has no cheat context.
      this.compiledPattern = new RegExp(
        // Longest first: "gamesense.pub" must win over a shorter "gamesense".
        `(?<![a-zA-Z0-9])(${[...escaped].sort((a, b) => b.length - a.length).join('|')})(?!\\d*[a-zA-Z])`,
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
    if (!this.ambiguous.has(squash(keywordLower))) return true
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
    // "spoofer_v2.exe", "esp-setup.exe": the exact name plus a version or package word.
    // A file name is at most 255 characters; longer text is a title or a blob,
    // and the suffix pattern is quadratic on a long run of separators.
    let stem = baseName
    for (let i = 0; i < 3 && stem.length <= 300 && NAME_SUFFIX.test(stem); i++) {
      stem = stem.replace(NAME_SUFFIX, '').replace(/[-_ .]+$/, '')
      if (this.exactMatch.has(stem)) return stem
    }
    const profile = profileSpan(textLower)

    if (this.compiledPattern) {
      for (const match of textLower.matchAll(this.compiledPattern)) {
        const matchedLower = match[1]
        // C:\Users\Mason\…: the account's name is not a cheat name.
        if (profile && (match.index ?? 0) >= profile[0] && (match.index ?? 0) < profile[1]) continue
        if (!this.qualifies(matchedLower, textLower, baseName, match.index ?? 0)) continue
        // Use O(1) lookup with patternIndexMap instead of O(n) loop
        const index = this.patternIndexMap.get(squash(matchedLower))
        return index !== undefined ? this.patterns[index] : match[1]
      }
    }

    return null
  }

  /**
   * findKeyword for a finding line as scanners write it — "[BAM] C:\\…\\x.exe |
   * 12/10/2026, 10:00", "[USN C:] a.exe → b.dll — created", "x.lnk -> target",
   * "module: x.dll (in game.exe)". The decorations hide the file name from the
   * exact-name and everyday-word checks, so each part, and then each file name
   * in it, is also tried on its own: the finding gets the keyword the scanner
   * flagged it for.
   */
  findKeywordInFinding(text: string): string | null {
    // A Steam launch option that switches protection off (CS2: -insecure).
    const launch = /^\[Steam Launch Options\].* launch option (-[a-z_]+) /i.exec(text)
    if (launch) return launch[1].toLowerCase()
    const whole = this.findKeyword(text)
    if (whole) return whole
    // The scanner that wrote the line already matched the FULL page title or
    // value and tagged it "{keyword}" right after the source. The line only
    // keeps the first 300 characters of a long title, so the context that made
    // an everyday-word keyword count may be cut off: the tag is honoured (it
    // must name a real keyword) instead of showing a lead with no keyword.
    const tagged = /^\[[^\]]*\]\s*\{([^}]{1,80})\}\s/.exec(text)
    if (tagged) {
      const index = this.patternIndexMap.get(squash(tagged[1].toLowerCase()))
      if (index !== undefined) return this.patterns[index]
    }
    const parts = text
      .split(/\r?\n|\s+(?:\||→|—|->|=)\s+|\s{4,}/)
      // Leading "[source]" / "{keyword}" / "Path:" labels, and a prefetch file's
      // ".pf" (SPOOFER.EXE-1A2B3C4D.pf names spoofer.exe).
      .map((p) => p.replace(/^(?:\[[^\]]*\]\s*|\{[^}]*\}\s*|[a-z]+:\s+)+/i, '').replace(/\.pf$/i, '').trim())
      .filter((p) => p && p !== text)
      // a finding is a line or a few; a blob of thousands of parts is not worth a pass each
      .slice(0, 500)
    for (const part of parts) {
      const keyword = this.findKeyword(part)
      if (keyword) return keyword
    }
    for (const part of parts) {
      for (const token of part.split(/[\s"'()]+/)) {
        if (!/\.[a-z0-9]{2,4}$/i.test(token) || token === part) continue
        const keyword = this.findKeyword(token)
        if (keyword) return keyword
      }
    }
    return null
  }

  getKeywords(): readonly string[] {
    return this.patterns
  }
}
