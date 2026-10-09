import { spawn } from 'child_process'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { execFileAsync, outputDecoder } from '../utils/async-exec'
import { formatTimestamp } from '../utils/format'
import { UsnAggregator, dateOrderFromPattern, lineReader, parseUsnRecord, splitCsv, usnColumns } from './usn-journal'
import { parseRegValues } from './anti-forensics'

/** Stop reading after this long and report what was found — the journal can be huge. */
const READ_BUDGET_MS = 22_000

/**
 * The NTFS change journal of the system drive: every file that ever carried a
 * cheat-like name — created, renamed, written or deleted — with its rename
 * chain and last activity time. Survives deletion of the files themselves.
 * Requires administrator rights.
 */
export class UsnJournalScanner extends BaseScanner {
  readonly name = 'USN Journal Scanner'
  readonly description = 'NTFS change journal: created, renamed and deleted cheat files'

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()
    const drive = (process.env.SystemDrive ?? 'C:').replace(/\\$/, '')
    this.emitProgress(events, 0, 1, `Reading the ${drive} change journal...`)

    const { stdout: intl } = await execFileAsync('reg', ['query', 'HKCU\\Control Panel\\International', '/v', 'sShortDate'], { timeoutMs: 5000 })
    const order = dateOrderFromPattern(parseRegValues(intl).get('sshortdate'))
    const agg = new UsnAggregator((name) => this.keywordMatcher.containsKeyword(name))
    // fsutil writes in the console code page when piped (CP866 on Russian
    // Windows): read bytes and decode per line, or Cyrillic names are garbage.
    const decode = await outputDecoder()

    const outcome = await new Promise<{ records: number; error: string | null; truncated: boolean }>((resolve) => {
      let records = 0
      let firstLines = ''
      let truncated = false
      const proc = spawn('fsutil', ['usn', 'readjournal', drive, 'csv'], { windowsHide: true })
      const stop = (why: 'deadline' | 'cancel') => {
        truncated = why === 'deadline'
        try { proc.kill() } catch { /* already gone */ }
      }
      const deadline = setTimeout(() => stop('deadline'), READ_BUDGET_MS)
      const cancelPoll = setInterval(() => { if (this.cancelled) stop('cancel') }, 250)

      let cols: ReturnType<typeof usnColumns> | null = null
      const lines = lineReader(decode, (line) => {
        if (firstLines.length < 2000) firstLines += line + '\n'
        if (!cols) {
          // The first CSV-shaped line is the (possibly localized) header;
          // anything before it is a banner or an error message.
          if (splitCsv(line).length >= 5) cols = usnColumns(line)
          return
        }
        const r = parseUsnRecord(line, cols, order)
        if (!r) return
        records++
        agg.add(r)
      })
      proc.stdout.on('data', (chunk: Buffer) => lines.push(chunk))
      proc.stderr.on('data', (d: Buffer) => { if (firstLines.length < 2000) firstLines += decode(d) })
      let finished = false
      const done = () => {
        if (finished) return
        finished = true
        lines.end()
        clearTimeout(deadline)
        clearInterval(cancelPoll)
        resolve({ records, error: records === 0 ? firstLines.trim().split(/\r?\n/)[0] ?? 'no output' : null, truncated })
      }
      proc.on('error', (e) => { firstLines = e.message; done() })
      proc.stdout.on('close', done)
    })

    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)
    if (outcome.records === 0) {
      return this.createErrorResult(
        /administrat|privilege|denied|администратор|привилеги|отказано/i.test(outcome.error ?? '')
          ? 'Requires administrator rights'
          : `Change journal unavailable${outcome.error ? `: ${outcome.error}` : ''}`,
        startTime
      )
    }

    const findings = agg.findings(drive, (ms) => formatTimestamp(new Date(ms)))
    this.emitProgress(events, 1, 1, outcome.truncated ? 'Partial read (time budget reached)' : '')
    return this.createSuccessResult(findings, startTime)
  }
}
