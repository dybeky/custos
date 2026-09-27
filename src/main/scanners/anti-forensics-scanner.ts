import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { AppConfig, ScanSettings } from '../services/config-service'
import { KeywordMatcher } from '../services/keyword-matcher'
import { execFileAsync } from '../utils/async-exec'
import {
  PrefetchEntry, assessCleanerRuns, assessLogClears, assessPrefetchConfig, assessPrefetchVolume,
  parseEventTimes, parseRegDword
} from './anti-forensics'

const PREFETCH_PARAMS_KEY =
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters'
const SYSMAIN_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SysMain'

/**
 * Looks for signs that forensic traces were removed before the check:
 * Prefetch disabled or emptied, event logs cleared, trace cleaners run
 * recently. See ./anti-forensics for the rules; this class only gathers data.
 *
 * Every probe is independent and best-effort: a probe that cannot run (no
 * admin rights, missing key) contributes nothing rather than a false signal.
 */
export class AntiForensicsScanner extends BaseScanner {
  readonly name = 'Anti-Forensics Scanner'
  readonly description = 'Detecting cleared logs, wiped Prefetch and trace cleaners'

  constructor(
    keywordMatcher: KeywordMatcher,
    scanSettings: ScanSettings,
    private config: AppConfig
  ) {
    super(keywordMatcher, scanSettings)
  }

  protected async doScan(events: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    this.reset()
    const findings: string[] = []
    const now = Date.now()

    this.emitProgress(events, 0, 3, 'Checking Prefetch configuration...')
    const [paramsOut, sysMainOut] = await Promise.all([
      this.regQueryValue(PREFETCH_PARAMS_KEY, 'EnablePrefetcher'),
      this.regQueryValue(SYSMAIN_KEY, 'Start')
    ])
    findings.push(
      ...assessPrefetchConfig(parseRegDword(paramsOut, 'EnablePrefetcher'), parseRegDword(sysMainOut, 'Start'))
    )
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    this.emitProgress(events, 1, 3, 'Inspecting Prefetch history...')
    const prefetch = await this.readPrefetch()
    if (prefetch) {
      findings.push(...assessPrefetchVolume(prefetch), ...assessCleanerRuns(prefetch, now))
    }
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    this.emitProgress(events, 2, 3, 'Checking event logs for clears...')
    const [systemXml, securityXml] = await Promise.all([
      this.queryEvents('System', 104),
      this.queryEvents('Security', 1102)
    ])
    findings.push(...assessLogClears(parseEventTimes(systemXml), parseEventTimes(securityXml), now))

    this.emitProgress(events, 3, 3, '')
    return this.createSuccessResult(findings, startTime)
  }

  private async regQueryValue(key: string, value: string): Promise<string> {
    const { stdout } = await execFileAsync('reg', ['query', key, '/v', value], { timeoutMs: 5000 })
    return stdout
  }

  /**
   * Prefetch entries with their last-write times, or null when the folder
   * cannot be read (it needs admin rights) — "unreadable" must never be
   * mistaken for "empty".
   */
  private async readPrefetch(): Promise<PrefetchEntry[] | null> {
    const dir = this.config.paths.windows.prefetchPath
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return null
    }
    const entries: PrefetchEntry[] = []
    for (const name of names) {
      if (this.cancelled) break
      try {
        entries.push({ name, mtimeMs: (await stat(join(dir, name))).mtimeMs })
      } catch {
        // file vanished or is locked — skip
      }
    }
    return entries
  }

  /** The newest few events with `eventId` in `log`, as XML ('' on failure). */
  private async queryEvents(log: string, eventId: number): Promise<string> {
    const { stdout } = await execFileAsync(
      'wevtutil',
      ['qe', log, `/q:*[System[Provider[@Name='Microsoft-Windows-Eventlog'] and (EventID=${eventId})]]`, '/c:5', '/rd:true', '/f:xml'],
      { timeoutMs: 10000 }
    )
    return stdout
  }
}
