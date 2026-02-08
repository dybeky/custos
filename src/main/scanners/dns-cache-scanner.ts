import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { logger } from '../services/logger'

interface DnsCacheEntry {
  recordName: string
  recordType: string
  ttl: number
}

const MIN_CACHE_ENTRIES_THRESHOLD = 5

export class DnsCacheScanner extends BaseScanner {
  readonly name = 'DNS Cache Scanner'
  readonly description = 'Scanning Windows DNS cache for suspicious domain resolutions'

  async scan(events?: ScannerEventEmitter): Promise<ScanResult> {
    const startTime = new Date()
    this.reset()

    try {
      const results: string[] = []

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 1,
          totalItems: 3,
          currentPath: 'Reading DNS cache...',
          percentage: 10
        })
      }

      const output = await asyncExec('ipconfig /displaydns', {
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024
      })

      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 2,
          totalItems: 3,
          currentPath: 'Parsing DNS entries...',
          percentage: 40
        })
      }

      const entries = this.parseDnsOutput(output)

      // Detect suspiciously empty cache (may indicate recent ipconfig /flushdns)
      if (entries.length < MIN_CACHE_ENTRIES_THRESHOLD && output.trim().length > 0) {
        results.push(
          `[DNS Cache] Warning: Suspiciously empty DNS cache (${entries.length} entries) — possible recent flush`
        )
      }

      if (events?.onProgress) {
        events.onProgress({
          scannerName: this.name,
          currentItem: 3,
          totalItems: 3,
          currentPath: 'Checking keywords...',
          percentage: 70
        })
      }

      // Check each entry against keyword matcher
      const seenDomains = new Set<string>()
      for (const entry of entries) {
        if (this.cancelled) break

        const domainLower = entry.recordName.toLowerCase()
        if (seenDomains.has(domainLower)) continue
        seenDomains.add(domainLower)

        if (this.keywordMatcher.containsKeyword(entry.recordName)) {
          const keyword = this.keywordMatcher.findKeyword(entry.recordName)
          let line = `[DNS Cache] `
          if (keyword) line += `{${keyword}} `
          line += entry.recordName
          if (entry.recordType) line += ` (${entry.recordType})`
          if (entry.ttl > 0) line += ` | TTL: ${entry.ttl}s`
          results.push(line)
        }
      }

      return this.createSuccessResult(results, startTime)
    } catch (error) {
      if (this.cancelled) {
        return this.createErrorResult('Scan cancelled', startTime)
      }
      logger.error('DNS Cache Scanner error', error instanceof Error ? error : new Error(String(error)))
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      )
    }
  }

  /**
   * Parse ipconfig /displaydns output.
   * Supports both English and Russian locales.
   *
   * English format:
   *   Record Name . . . : example.com
   *   Record Type . . . : 1
   *   Time To Live  . . : 300
   *
   * Russian format:
   *   Имя записи. . . . : example.com
   *   Тип записи. . . . : 1
   *   Срок жизни. . . .  : 300
   */
  private parseDnsOutput(output: string): DnsCacheEntry[] {
    const entries: DnsCacheEntry[] = []
    const lines = output.split('\n')

    let currentName = ''
    let currentType = ''
    let currentTtl = 0

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Record Name / Имя записи
      const nameMatch = trimmed.match(/^(?:Record Name|Имя записи)\s*\.+\s*:\s*(.+)/i)
      if (nameMatch && nameMatch[1]) {
        // Save previous entry if exists
        if (currentName) {
          entries.push({ recordName: currentName.trim(), recordType: currentType, ttl: currentTtl })
        }
        currentName = nameMatch[1].trim()
        currentType = ''
        currentTtl = 0
        continue
      }

      // Record Type / Тип записи
      const typeMatch = trimmed.match(/^(?:Record Type|Тип записи)\s*\.+\s*:\s*(.+)/i)
      if (typeMatch && typeMatch[1]) {
        const typeNum = parseInt(typeMatch[1].trim(), 10)
        if (!isNaN(typeNum)) {
          currentType = this.dnsTypeToString(typeNum)
        }
        continue
      }

      // Time To Live / Срок жизни
      const ttlMatch = trimmed.match(/^(?:Time To Live|Срок жизни)\s*\.+\s*:\s*(\d+)/i)
      if (ttlMatch && ttlMatch[1]) {
        currentTtl = parseInt(ttlMatch[1], 10)
        if (isNaN(currentTtl)) currentTtl = 0
        continue
      }
    }

    // Push last entry
    if (currentName) {
      entries.push({ recordName: currentName.trim(), recordType: currentType, ttl: currentTtl })
    }

    return entries
  }

  private dnsTypeToString(type: number): string {
    switch (type) {
      case 1: return 'A'
      case 5: return 'CNAME'
      case 28: return 'AAAA'
      case 33: return 'SRV'
      default: return String(type)
    }
  }
}
