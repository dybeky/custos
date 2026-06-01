import { BaseScanner } from './base-scanner'
import { execFileAsync } from '../utils/async-exec'
import { logger } from '../services/logger'

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
   * Run `reg query` and apply the standard registry-value parse used by
   * RegistryScanner:
   *
   *   ValueName    REG_TYPE    Data
   *
   * Returns findings formatted as `[<label>] ValueName = Data` where the
   * keyword appears in Data, or in ValueName when ValueName is a path.
   *
   * Respects `this.cancelled` — bails out of the line loop early if set.
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
    const results: string[] = []
    const stdout = await this.runRegQuery(rootKeyPath, recursive)
    const lines = stdout.split('\n')

    for (const line of lines) {
      if (this.cancelled) break

      const trimmed = line.trim()
      if (!trimmed) continue

      // Skip registry key header lines (e.g. HKEY_LOCAL_MACHINE\...)
      if (trimmed.startsWith('HKEY_')) continue

      // Parse reg query format: ValueName    REG_TYPE    Data
      // Fields are separated by 4+ spaces.
      const parts = trimmed.split(/\s{4,}/)

      if (parts.length >= 3) {
        const valueName = parts[0]
        // parts[1] is REG_TYPE — not used
        const data = parts.slice(2).join(' ')

        if (this.keywordMatcher.containsKeyword(data)) {
          results.push(`[${label}] ${valueName} = ${data}`)
        } else if (valueName.includes('\\') && this.keywordMatcher.containsKeyword(valueName)) {
          results.push(`[${label}] ${valueName} = ${data}`)
        }
      } else if (parts.length === 1 && !trimmed.startsWith('(')) {
        // Single value without type — might be a default value
        if (this.keywordMatcher.containsKeyword(trimmed)) {
          results.push(`[${label}] ${trimmed}`)
        }
      }
      // parts.length === 2 means ValueName + REG_TYPE with no data — skip
    }

    return results
  }
}
