import { basename } from 'path'
import { KeywordSettings } from './config-service'

export class KeywordMatcher {
  private patterns: string[]
  private patternsLower: string[]
  private exactMatch: Set<string>
  private compiledPattern: RegExp | null = null
  private patternIndexMap: Map<string, number> = new Map()

  constructor(settings: KeywordSettings) {
    this.patterns = settings.patterns || []
    this.patternsLower = this.patterns.map(k => k.toLowerCase())
    this.exactMatch = new Set(
      (settings.exactMatch || []).map(e => e.toLowerCase())
    )

    // Compile all patterns into a single regex for O(1) matching
    if (this.patternsLower.length > 0) {
      // Escape regex special characters in patterns
      const escaped = this.patternsLower.map(p =>
        p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      // Build pattern index map for findKeyword
      escaped.forEach((p, i) => this.patternIndexMap.set(p, i))

      // Create pattern with word boundaries
      // Use non-alphanumeric as word boundary: (?<![a-zA-Z0-9]) and (?![a-zA-Z0-9])
      this.compiledPattern = new RegExp(
        `(?<![a-zA-Z0-9])(${escaped.join('|')})(?![a-zA-Z0-9])`,
        'i'
      )
    }
  }

  containsKeyword(text: string): boolean {
    if (!text) return false

    const textLower = text.toLowerCase()
    const baseName = this.getFileNameWithoutExtension(textLower)

    // Check exact matches first (O(1) lookup)
    if (this.exactMatch.has(baseName)) {
      return true
    }

    // Use compiled regex for pattern matching (single pass)
    return this.compiledPattern?.test(textLower) ?? false
  }

  private getFileNameWithoutExtension(filePath: string): string {
    const fileName = basename(filePath)
    const lastDot = fileName.lastIndexOf('.')
    return lastDot > 0 ? fileName.substring(0, lastDot) : fileName
  }

  // Alias for compatibility
  containsKeywordWithWhitelist(text: string, _path?: string): boolean {
    return this.containsKeyword(text)
  }

  findKeyword(text: string): string | null {
    if (!text) return null

    const textLower = text.toLowerCase()
    const baseName = this.getFileNameWithoutExtension(textLower)

    if (this.exactMatch.has(baseName)) {
      return baseName
    }

    if (this.compiledPattern) {
      const match = textLower.match(this.compiledPattern)
      if (match && match[1]) {
        // Use O(1) lookup with patternIndexMap instead of O(n) loop
        const matchedLower = match[1].toLowerCase()
        const escapedMatch = matchedLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const index = this.patternIndexMap.get(escapedMatch)
        if (index !== undefined) {
          return this.patterns[index]
        }
        return match[1]
      }
    }

    return null
  }

  getKeywords(): readonly string[] {
    return this.patterns
  }
}
