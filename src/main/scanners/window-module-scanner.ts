import { z } from 'zod'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { asyncExec } from '../utils/async-exec'
import { execFileAsync } from '../utils/async-exec'

// ---------------------------------------------------------------------------
// Pure parsing helpers — exported so unit tests can exercise them directly
// without spawning any processes.
// ---------------------------------------------------------------------------

const WindowEntrySchema = z.object({
  ProcessName: z.string().catch(''),
  Id: z.number().catch(0),
  MainWindowTitle: z.string().catch('')
})

export interface WindowEntry {
  processName: string
  id: number
  mainWindowTitle: string
}

/**
 * Parse the JSON output of:
 *   Get-Process | Where-Object { $_.MainWindowTitle } |
 *     Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json
 *
 * PowerShell outputs a single object when only one result exists, and an
 * array when there are multiple results. Both forms are handled here.
 */
export function parseWindowJson(raw: string): WindowEntry[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  const items = Array.isArray(parsed) ? parsed : [parsed]
  const results: WindowEntry[] = []

  for (const item of items) {
    const validated = WindowEntrySchema.safeParse(item)
    if (!validated.success) continue
    const { ProcessName, Id, MainWindowTitle } = validated.data
    if (!MainWindowTitle) continue
    results.push({
      processName: ProcessName,
      id: Id,
      mainWindowTitle: MainWindowTitle
    })
  }

  return results
}

/**
 * Parse the stdout of `tasklist /m` (table format, one line per process).
 *
 * `tasklist /m` output (English locale) looks like:
 *
 *   Image Name                     PID Modules
 *   ========================= ======== ============================================
 *   System                          4 ntdll.dll
 *   svchost.exe                   844 ntdll.dll, KERNEL32.DLL, KERNELBASE.dll
 *   cheatengine-x86_64.exe       4242 ntdll.dll, cheat_hook.dll, speed_hack.dll
 *
 * Each data line contains:
 *   - Image name (up to 25 chars, left-aligned, padded with spaces)
 *   - PID (right-aligned, 8-char field)
 *   - Comma-separated module names (rest of line)
 *
 * We split on 2+ consecutive spaces to separate name/PID from the module list,
 * then split the module list on commas.
 *
 * Returns an array of `{ processName, moduleName }` pairs.
 */
export interface ModuleEntry {
  processName: string
  moduleName: string
}

// Matches a data row from `tasklist /m`:
//   <ImageName>   <PID>   <comma-separated modules>
// Image names never contain spaces; PID is all digits; modules follow.
const TASKLIST_ROW_RE = /^(\S+)\s+(\d+)\s+(.+)$/

export function parseTasklistModules(stdout: string): ModuleEntry[] {
  const lines = stdout.split('\n')
  const entries: ModuleEntry[] = []

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '').trim()
    // Skip blank lines and the header / separator lines
    if (!line || /^={3,}/.test(line) || /^Image Name/i.test(line)) continue

    const match = TASKLIST_ROW_RE.exec(line)
    if (!match) continue

    const processName = match[1]
    // match[2] is the PID — already validated as digits by the regex
    const modulePart = match[3]

    const modules = modulePart.split(',').map(m => m.trim()).filter(Boolean)
    for (const moduleName of modules) {
      entries.push({ processName, moduleName })
    }
  }

  return entries
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

export class WindowModuleScanner extends BaseScanner {
  readonly name = 'Window & Module Scanner'
  readonly description = 'Scans process window titles and loaded modules against the keyword list'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()

    const findings: string[] = []
    const seen = new Set<string>()

    // --- Phase 1: Window titles via PowerShell ---
    this.emitProgress(events, 0, 3, 'Enumerating window titles...')

    try {
      const psScript = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object ProcessName, Id, MainWindowTitle | ConvertTo-Json -Compress`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const output = await asyncExec(
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 15000 }
      )

      if (!this.cancelled) {
        const entries = parseWindowJson(output)
        for (const entry of entries) {
          if (this.cancelled) break
          if (!this.keywordMatcher.containsKeyword(entry.mainWindowTitle)) continue
          const finding = `window: "${entry.mainWindowTitle}" (${entry.processName}, pid ${entry.id})`
          if (!seen.has(finding)) {
            seen.add(finding)
            findings.push(finding)
          }
        }
      }
    } catch {
      // Window title enumeration failed — continue to module phase
    }

    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    // --- Phase 2: Loaded modules via tasklist /m ---
    this.emitProgress(events, 1, 3, 'Enumerating loaded modules...')

    try {
      const { stdout } = await execFileAsync('tasklist', ['/m'])

      if (!this.cancelled) {
        const entries = parseTasklistModules(stdout)
        for (const entry of entries) {
          if (this.cancelled) break
          if (!this.keywordMatcher.containsKeyword(entry.moduleName)) continue
          const finding = `module: ${entry.moduleName} (in ${entry.processName})`
          if (!seen.has(finding)) {
            seen.add(finding)
            findings.push(finding)
          }
        }
      }
    } catch {
      // Module enumeration failed — return whatever we have
    }

    this.emitProgress(events, 3, 3, '')
    return this.createSuccessResult(findings, startTime)
  }
}
