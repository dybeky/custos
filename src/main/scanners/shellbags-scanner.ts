import { ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { RegistryQueryScanner } from './registry-query-scanner'

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

export class ShellbagsScanner extends RegistryQueryScanner {
  readonly name = 'Shellbags Scanner'
  readonly description = 'Scanning Shellbags for folder access history'

  private shellbagPaths = [
    // Explorer shellbags (current user)
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Microsoft\\Windows\\Shell\\Bags',
    // Local settings shellbags (current user)
    'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\Bags',
    // Wow64 shellbags
    'HKCU\\Software\\Classes\\Wow6432Node\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU',
    'HKCU\\Software\\Classes\\Wow6432Node\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\Bags'
  ]

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const results: string[] = []
    const seenPaths = new Set<string>()

    const totalSteps = this.shellbagPaths.length

    // Scan shellbag paths with limited concurrency (max 2 at a time)
    const concurrency = 2
    let completed = 0

    for (let i = 0; i < this.shellbagPaths.length; i += concurrency) {
      if (this.cancelled) break

      const chunk = this.shellbagPaths.slice(i, i + concurrency)
      const chunkPromises = chunk.map(async (regPath) => {
        if (this.cancelled) return []

        completed++
        if (events?.onProgress) {
          events.onProgress({
            scannerName: this.name,
            currentItem: completed,
            totalItems: totalSteps,
            currentPath: regPath.split('\\').slice(-2).join('\\'),
            percentage: (completed / totalSteps) * 100
          })
        }

        return this.scanShellbagPath(regPath, seenPaths)
      })

      const chunkResults = await Promise.all(chunkPromises)
      for (const pathResults of chunkResults) {
        results.push(...pathResults)
      }
    }

    // Note: PowerShell deep scan removed - registry query already gets the data
    // and the PowerShell scan added 60s timeout causing potential freezes

    return this.createSuccessResult(results, startTime)
  }

  private async scanShellbagPath(regPath: string, seenPaths: Set<string>): Promise<string[]> {
    const results: string[] = []

    // Use runRegQuery (no shell) — specialized shellbags parsing preserved below:
    // tracks currentKey, extracts paths, deduplicates with seenPaths.
    const output = await this.runRegQuery(regPath)

    const lines = output.split('\n')
    let currentKey = ''

    for (const line of lines) {
      if (this.cancelled) break

      const trimmed = line.trim()
      if (!trimmed) continue

      // Track current registry key
      if (trimmed.startsWith('HKEY_')) {
        currentKey = trimmed
        continue
      }

      // BagMRU values are binary shell items: the folder names are inside.
      const binary = /^(\S+)\s{4,}REG_BINARY\s{4,}([0-9a-f]+)$/i.exec(trimmed)
      if (binary) {
        for (const name of shellItemStrings(binary[2])) {
          const key = `item:${name.toLowerCase()}`
          if (seenPaths.has(key) || !this.keywordMatcher.containsKeyword(name)) continue
          seenPaths.add(key)
          results.push(`[Shellbags] ${name}`)
        }
        continue
      }

      // Shellbag entries can contain folder paths in various formats
      // Check both the key path and value data for keywords
      const combined = `${currentKey} ${trimmed}`

      // Look for path-like patterns in the data
      const pathMatches = this.extractPaths(combined)

      for (const pathMatch of pathMatches) {
        if (seenPaths.has(pathMatch.toLowerCase())) continue

        if (this.keywordMatcher.containsKeyword(pathMatch)) {
          seenPaths.add(pathMatch.toLowerCase())
          results.push(`[Shellbags] ${pathMatch}`)
        }
      }

      // Also check the raw line for keywords
      if (this.keywordMatcher.containsKeyword(trimmed)) {
        // Extract meaningful part
        const parts = trimmed.split(/\s{4,}/)
        if (parts.length > 0) {
          const valuePart = parts[parts.length - 1] || parts[0]
          const key = `raw:${valuePart}`.toLowerCase()
          if (!seenPaths.has(key)) {
            seenPaths.add(key)
            results.push(`[Shellbags] ${trimmed}`)
          }
        }
      }
    }

    return results
  }

  private extractPaths(text: string): string[] {
    const paths: string[] = []

    // Match common path patterns
    // Drive letter paths: C:\folder\subfolder
    // eslint-disable-next-line no-control-regex
    const drivePathRegex = /[A-Z]:\\[^<>:"|?*\x00-\x1F]+/gi
    const driveMatches = text.match(drivePathRegex)
    if (driveMatches) {
      paths.push(...driveMatches)
    }

    // UNC paths: \\server\share
    // eslint-disable-next-line no-control-regex
    const uncRegex = /\\\\[^\\<>:"|?*\x00-\x1F]+\\[^<>:"|?*\x00-\x1F]*/gi
    const uncMatches = text.match(uncRegex)
    if (uncMatches) {
      paths.push(...uncMatches)
    }

    // Folder names that might be stored without full path
    // Strict filtering to avoid false positives from common Windows folder names
    const COMMON_FOLDER_NAMES = new Set([
      'reg_binary', 'reg_sz', 'reg_dword', 'reg_expand_sz', 'reg_multi_sz', 'reg_qword',
      'hkey_current_user', 'hkey_local_machine', 'hkey_users', 'hkey_classes_root',
      'software', 'microsoft', 'windows', 'shell', 'bags', 'bag', 'mru', 'bagmru',
      'desktop', 'documents', 'downloads', 'pictures', 'music', 'videos',
      'program', 'program files', 'program files (x86)', 'programdata',
      'users', 'user', 'public', 'default', 'appdata', 'local', 'roaming',
      'temp', 'system32', 'syswow64', 'system', 'common', 'start menu',
      'programs', 'startup', 'templates', 'recent', 'sendto', 'favorites',
      'settings', 'classes', 'local settings', 'wow6432node', 'currentversion',
      'explorer', 'internet explorer', 'node', 'version'
    ])
    const folderNames = text.split(/[\\/\s]+/).filter(part =>
      part.length > 3 &&
      !COMMON_FOLDER_NAMES.has(part.toLowerCase()) &&
      !part.match(/^(REG_|HKEY_)/i)
    )
    paths.push(...folderNames)

    return [...new Set(paths)] // Remove duplicates
  }
}
