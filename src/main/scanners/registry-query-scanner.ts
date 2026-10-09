import { BaseScanner } from './base-scanner'
import { execFileAsync } from '../utils/async-exec'
import { logger } from '../services/logger'
import type { KeywordMatcher } from '../services/keyword-matcher'

/**
 * Readable names inside a shell item list (a BagMRU REG_BINARY value): Explorer
 * stores each folder's long name as UTF-16LE and its short name as 8-bit
 * text. Returns runs of printable text, longest first, deduplicated.
 */
export function shellItemStrings(hex: string): string[] {
  const clean = hex.replace(/[^0-9a-f]/gi, '')
  if (clean.length < 8 || clean.length % 2) return []
  const bytes = Buffer.from(clean, 'hex')
  const out = new Set<string>()

  // UTF-16LE runs (long names), at both byte alignments. Only Latin and
  // Cyrillic text counts: binary fields decode as stray CJK-looking chars.
  const nameChar = (c: number) =>
    (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0x24f) || (c >= 0x400 && c <= 0x4ff)
  for (let start = 0; start < 2; start++) {
    let run = ''
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const c = bytes[i] | (bytes[i + 1] << 8)
      if (nameChar(c)) run += String.fromCharCode(c)
      else {
        if (run.trim().length >= 3) out.add(run.trim())
        run = ''
      }
    }
    if (run.trim().length >= 3) out.add(run.trim())
  }
  // 8-bit ASCII runs (short 8.3 names).
  let run = ''
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) run += String.fromCharCode(b)
    else {
      if (run.length >= 4) out.add(run)
      run = ''
    }
  }
  if (run.length >= 4) out.add(run)
  return [...out].filter((x) => /[a-z0-9]{3}/i.test(x)).sort((a, b) => b.length - a.length)
}

/** UserAssist stores program paths ROT13-encoded in its value names. */
export function rot13(text: string): string {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

/**
 * Keyword findings in `reg query` output:
 *
 *   ValueName    REG_TYPE    Data
 *
 * Returns `[<label>] ValueName = Data` where the keyword appears in Data, or in
 * ValueName when ValueName is a path. REG_BINARY data is read for the text it
 * holds (RecentDocs / OpenSavePidlMRU keep file names there as UTF-16), and
 * UserAssist value names are ROT13-decoded first — matched raw, neither could
 * ever contain a keyword.
 */
export function registryFindings(
  stdout: string,
  label: string,
  rootKeyPath: string,
  matcher: KeywordMatcher,
  cancelled: () => boolean = () => false
): string[] {
  const results: string[] = []
  const userAssist = /\\UserAssist(\\|$)/i.test(rootKeyPath)

  for (const line of stdout.split('\n')) {
    if (cancelled()) break

    const trimmed = line.trim()
    if (!trimmed) continue

    // Skip registry key header lines (e.g. HKEY_LOCAL_MACHINE\...)
    if (trimmed.startsWith('HKEY_')) continue

    // Fields are separated by 4+ spaces.
    const parts = trimmed.split(/\s{4,}/)

    if (parts.length >= 3) {
      const valueName = userAssist ? rot13(parts[0]) : parts[0]
      const raw = parts.slice(2).join(' ')
      // UserAssist data is run counters and timestamps, not text.
      const data = parts[1] !== 'REG_BINARY' ? raw : userAssist ? '' : shellItemStrings(raw).join(' | ')

      if (matcher.containsKeyword(data)) {
        results.push(`[${label}] ${valueName} = ${data}`)
      } else if (valueName.includes('\\') && matcher.containsKeyword(valueName)) {
        results.push(`[${label}] ${valueName}${data ? ` = ${data}` : ''}`)
      }
    } else if (parts.length === 1 && !trimmed.startsWith('(')) {
      // Single value without type — might be a default value
      if (matcher.containsKeyword(trimmed)) {
        results.push(`[${label}] ${trimmed}`)
      }
    }
    // parts.length === 2 means ValueName + REG_TYPE with no data — skip
  }

  return results
}

/**
 * Abstract base class that provides shared helpers for scanners that query
 * the Windows registry via `reg.exe`.
 *
 * Concrete scanners still implement their own `doScan`; this class only
 * centralises:
 *   - `runRegQuery`   — executes `reg query` and returns raw stdout
 *   - `queryRegistry` — runs the query AND applies the standard parse /
 *                        keyword-match used by RegistryScanner
 *
 * Scanners with specialised parsing (BAM, Amcache, Shellbags) call
 * `runRegQuery` to get raw stdout and keep their own parsing logic.
 * RegistryScanner uses `queryRegistry` directly.
 */
export abstract class RegistryQueryScanner extends BaseScanner {
  /**
   * Run `reg query <rootKeyPath> [/s]` without a shell and return the raw
   * stdout.  Never throws — if the key does not exist or access is denied the
   * empty string is returned and the caller's parsing loop simply produces no
   * results (identical to the old `2>nul` behaviour).
   */
  protected async runRegQuery(rootKeyPath: string, recursive = true): Promise<string> {
    const args = ['query', rootKeyPath, ...(recursive ? ['/s'] : [])]
    try {
      const { stdout } = await execFileAsync('reg', args)
      return stdout
    } catch (error) {
      // execFileAsync should never throw (it catches internally), but guard anyway
      logger.debug('runRegQuery unexpected error', {
        path: rootKeyPath,
        error: error instanceof Error ? error.message : String(error)
      })
      return ''
    }
  }

  /**
   * Run `reg query` and return its keyword findings (see registryFindings).
   * Respects `this.cancelled`.
   *
   * @param rootKeyPath  The registry key path to query.
   * @param label        Prefix used in finding strings, e.g. `"MuiCache"`.
   * @param recursive    Whether to pass `/s` to `reg query` (default: true).
   */
  protected async queryRegistry(
    rootKeyPath: string,
    label: string,
    recursive = true
  ): Promise<string[]> {
    const stdout = await this.runRegQuery(rootKeyPath, recursive)
    return registryFindings(stdout, label, rootKeyPath, this.keywordMatcher, () => this.cancelled)
  }
}
