import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { ScanResult } from '../../shared/types'
import { AppConfig, ScanSettings } from '../services/config-service'
import { KeywordMatcher } from '../services/keyword-matcher'
import { execFileAsync } from '../utils/async-exec'
import {
  PrefetchEntry, assessCleanerRuns, assessLogClears, assessPrefetchConfig, assessPrefetchVolume,
  parseEventTimes, parseRegDword, parseIfeoDebuggers, assessIfeoBlocking, assessDisallowRun,
  assessToolPolicies, assessDisabledServices, assessRegBlocked
} from './anti-forensics'
import { assessUsbWipe, parseSetupapiUsb, parseUsbstorRegistry } from './usb-history'
import { USBSTOR_KEY, readSetupapiLog } from './usb-scanner'

const PREFETCH_PARAMS_KEY =
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters'
const SYSMAIN_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\SysMain'
const SERVICES = 'HKLM\\SYSTEM\\CurrentControlSet\\Services'
const IFEO_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options'
]
const POLICY_SYSTEM = 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'
const POLICY_EXPLORER = 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer'
const POLICY_CMD = 'Software\\Policies\\Microsoft\\Windows\\System'

/**
 * Looks for signs that forensic traces were removed before the check —
 * Prefetch disabled or emptied, event logs cleared, trace cleaners run
 * recently — and that Windows components were switched off so checks or
 * checking tools cannot run (IFEO-blocked tools, DisallowRun, tool-disabling
 * policies, disabled Event Log / BAM / DNS Client, blocked reg.exe).
 * See ./anti-forensics for the rules; this class only gathers data.
 *
 * Every probe is independent and best-effort: a probe that cannot run (no
 * admin rights, missing key) contributes nothing rather than a false signal.
 */
export class AntiForensicsScanner extends BaseScanner {
  readonly name = 'Anti-Forensics Scanner'
  readonly description = 'Detecting cleared logs, wiped Prefetch, trace cleaners and blocked Windows tools'

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
    this.regStderr = []

    this.emitProgress(events, 0, 4, 'Checking Prefetch configuration...')
    const [paramsOut, sysMainOut] = await Promise.all([
      this.regQueryValue(PREFETCH_PARAMS_KEY, 'EnablePrefetcher'),
      this.regQueryValue(SYSMAIN_KEY, 'Start')
    ])
    findings.push(
      ...assessPrefetchConfig(parseRegDword(paramsOut, 'EnablePrefetcher'), parseRegDword(sysMainOut, 'Start'))
    )
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    this.emitProgress(events, 1, 4, 'Inspecting Prefetch history...')
    const prefetch = await this.readPrefetch()
    if (prefetch) {
      findings.push(...assessPrefetchVolume(prefetch), ...assessCleanerRuns(prefetch, now))
    }
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    this.emitProgress(events, 2, 4, 'Checking event logs for clears...')
    const [systemXml, securityXml] = await Promise.all([
      this.queryEvents('System', 104),
      this.queryEvents('Security', 1102)
    ])
    findings.push(...assessLogClears(parseEventTimes(systemXml), parseEventTimes(securityXml), now))
    if (this.cancelled) return this.createErrorResult('Scan cancelled', startTime)

    this.emitProgress(events, 3, 4, 'Checking for blocked tools and disabled components...')
    findings.push(...(await this.checkTampering()), ...(await this.checkUsbWipe(now)))

    this.emitProgress(events, 4, 4, '')
    return this.createSuccessResult(findings, startTime)
  }

  /** stderr of every reg.exe call this scan, to spot reg.exe itself being blocked. */
  private regStderr: string[] = []

  private async reg(args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync('reg', ['query', ...args], { timeoutMs: 8000 })
    if (stderr) this.regStderr.push(stderr)
    return stdout
  }

  private regQueryValue(key: string, value: string): Promise<string> {
    return this.reg([key, '/v', value])
  }

  private async regDword(key: string, value: string): Promise<number | null> {
    return parseRegDword(await this.regQueryValue(key, value), value)
  }

  /** The larger of the HKCU and HKLM policy value (either one applies). */
  private async policyDword(subKey: string, value: string): Promise<number | null> {
    const [cu, lm] = await Promise.all([this.regDword(`HKCU\\${subKey}`, value), this.regDword(`HKLM\\${subKey}`, value)])
    if (cu === null) return lm
    if (lm === null) return cu
    return Math.max(cu, lm)
  }

  /** USB storage history deleted from the registry (e.g. by USB Oblivion). */
  private async checkUsbWipe(now: number): Promise<string[]> {
    const [reg, setupapi] = await Promise.all([
      execFileAsync('reg', ['query', USBSTOR_KEY, '/s', '/v', 'FriendlyName'], { timeoutMs: 10000 }),
      readSetupapiLog()
    ])
    // A missing USBSTOR key ("unable to find") is a valid empty history; any
    // other error (access denied, reg.exe blocked) means we cannot tell.
    const unreadable = !reg.stdout.trim() && !!reg.stderr && !/unable to find/i.test(reg.stderr)
    return assessUsbWipe(parseSetupapiUsb(setupapi), unreadable ? null : parseUsbstorRegistry(reg.stdout), now)
  }

  /**
   * Components switched off so that checks or checking tools cannot run:
   * IFEO-blocked tools, DisallowRun, tool-disabling policies, disabled
   * artifact-recording services, and reg.exe itself being blocked.
   */
  private async checkTampering(): Promise<string[]> {
    const [ifeo, disallowCu, disallowLm, disallowListCu, disallowListLm, disableTaskMgr, disableRegistryTools, disableCmd, eventLog, bam, dnsCache] =
      await Promise.all([
        Promise.all(IFEO_KEYS.map((k) => this.reg([k, '/s', '/v', 'Debugger']))),
        this.regDword(`HKCU\\${POLICY_EXPLORER}`, 'DisallowRun'),
        this.regDword(`HKLM\\${POLICY_EXPLORER}`, 'DisallowRun'),
        this.reg([`HKCU\\${POLICY_EXPLORER}\\DisallowRun`]),
        this.reg([`HKLM\\${POLICY_EXPLORER}\\DisallowRun`]),
        this.policyDword(POLICY_SYSTEM, 'DisableTaskMgr'),
        this.policyDword(POLICY_SYSTEM, 'DisableRegistryTools'),
        this.policyDword(POLICY_CMD, 'DisableCMD'),
        this.regDword(`${SERVICES}\\EventLog`, 'Start'),
        this.regDword(`${SERVICES}\\bam`, 'Start'),
        this.regDword(`${SERVICES}\\Dnscache`, 'Start')
      ])
    return [
      ...assessRegBlocked(this.regStderr),
      ...assessIfeoBlocking(ifeo.flatMap(parseIfeoDebuggers)),
      ...new Set([...assessDisallowRun(disallowCu, disallowListCu), ...assessDisallowRun(disallowLm, disallowListLm)]),
      ...assessToolPolicies({ disableTaskMgr, disableRegistryTools, disableCmd }),
      ...assessDisabledServices({ eventLog, bam, dnsCache })
    ]
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
