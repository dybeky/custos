import { basename } from 'path'
import { KeywordSettings } from './config-service'

export class KeywordMatcher {
  private patterns: string[]
  private patternsLower: string[]
  private exactMatch: Set<string>

  constructor(settings: KeywordSettings) {
    this.patterns = settings.patterns || []
    this.patternsLower = this.patterns.map(k => k.toLowerCase())
    this.exactMatch = new Set(
      (settings.exactMatch || []).map(e => e.toLowerCase())
    )
  }

  containsKeyword(text: string): boolean {
    if (!text) return false

    const textLower = text.toLowerCase()
    const baseName = this.getFileNameWithoutExtension(textLower)

    if (this.exactMatch.has(baseName)) {
      return true
    }

    for (const pattern of this.patternsLower) {
      if (this.hasWordBoundaryMatch(textLower, pattern)) {
        return true
      }
    }

    return false
  }

  private hasWordBoundaryMatch(text: string, pattern: string): boolean {
    let index = 0
    while ((index = text.indexOf(pattern, index)) !== -1) {
      const leftBoundary = index === 0 || !this.isLetterOrDigit(text[index - 1])
      const endIndex = index + pattern.length
      const rightBoundary = endIndex >= text.length || !this.isLetterOrDigit(text[endIndex])

      if (leftBoundary && rightBoundary) {
        return true
      }

      index++
    }
    return false
  }

  private isLetterOrDigit(char: string): boolean {
    return /[a-zA-Z0-9]/.test(char)
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

    for (let i = 0; i < this.patternsLower.length; i++) {
      if (this.hasWordBoundaryMatch(textLower, this.patternsLower[i])) {
        return this.patterns[i]
      }
    }

    return null
  }

  getKeywords(): readonly string[] {
    return this.patterns
  }
}
