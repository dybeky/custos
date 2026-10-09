/**
 * Pure analysis for the anti-forensics (trace-cleaning) scanner.
 *
 * Every other scanner looks for traces a cheat LEFT. This module looks for
 * signs that traces were REMOVED: a disabled or emptied Prefetch store,
 * recently cleared Windows event logs, and trace cleaners run shortly before
 * the check. None of these proves cheating — people clear logs and run
 * CCleaner for ordinary reasons — but on a machine about to be checked they
 * explain why other scanners may come back empty, and they deserve a question.
 *
 * All functions here are side-effect free; the scanner gathers the raw data.
 */

/** Label every anti-forensics finding starts with. */
export const TRACE_PREFIX = '[Trace cleaning]'

/** A Windows install that is in use keeps far more prefetch files than this. */
export const MIN_EXPECTED_PREFETCH_FILES = 20

/** Event-log clears newer than this are reported. */
export const LOG_CLEAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** Cleaner runs newer than this are reported (older runs are routine upkeep). */
export const CLEANER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Trace/privacy cleaners and secure-delete tools, keyed by the executable name
 * recorded in a prefetch file (upper-case, as Windows writes it).
 */
export const TRACE_CLEANERS: Readonly<Record<string, string>> = {
  'CCLEANER.EXE': 'CCleaner',
  'CCLEANER64.EXE': 'CCleaner',
  'PRIVAZER.EXE': 'PrivaZer',
  'BLEACHBIT.EXE': 'BleachBit',
  'BLEACHBIT_CONSOLE.EXE': 'BleachBit',
  'WISEDISKCLEANER.EXE': 'Wise Disk Cleaner',
  'WISEREGCLEANER.EXE': 'Wise Registry Cleaner',
  'PRIVACYERASER.EXE': 'Privacy Eraser',
  'ERASER.EXE': 'Eraser',
  'SDELETE.EXE': 'SDelete',
  'SDELETE64.EXE': 'SDelete',
  'SDELETE64A.EXE': 'SDelete',
  'USBOBLIVION.EXE': 'USB Oblivion',
  'USBOBLIVION32.EXE': 'USB Oblivion',
  'USBOBLIVION64.EXE': 'USB Oblivion'
}

export interface PrefetchEntry {
  /** File name, e.g. `CCLEANER64.EXE-1A2B3C4D.pf`. */
  name: string
  /** Last-write time: Windows rewrites a .pf shortly after each launch. */
  mtimeMs: number
}

/** `2026-09-27 13:40 UTC (2 h ago)` — deterministic, timezone-independent. */
export function formatWhen(timeMs: number, nowMs: number): string {
  const stamp = new Date(timeMs).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const ageMin = Math.max(0, Math.round((nowMs - timeMs) / 60_000))
  const age =
    ageMin < 60 ? `${ageMin} min ago`
      : ageMin < 48 * 60 ? `${Math.round(ageMin / 60)} h ago`
        : `${Math.round(ageMin / (24 * 60))} days ago`
  return `${stamp} (${age})`
}

/** Parse a REG_DWORD value from `reg query <key> /v <name>` output. */
export function parseRegDword(output: string, valueName: string): number | null {
  const re = new RegExp(`^\\s*${valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'im')
  const m = re.exec(output)
  return m ? parseInt(m[1], 16) : null
}

/**
 * Prefetch configuration. `enablePrefetcher` 0 disables prefetch recording;
 * SysMain (the service that writes prefetch files) with Start=4 is disabled.
 */
export function assessPrefetchConfig(enablePrefetcher: number | null, sysMainStart: number | null): string[] {
  const out: string[] = []
  if (enablePrefetcher === 0) {
    out.push(`${TRACE_PREFIX} Prefetch recording is disabled (EnablePrefetcher = 0) — program launches are not being logged`)
  }
  if (sysMainStart === 4) {
    out.push(`${TRACE_PREFIX} The SysMain service is disabled — Windows is not writing new Prefetch files`)
  }
  return out
}

/** An almost empty Prefetch folder on an in-use system suggests it was wiped. */
export function assessPrefetchVolume(entries: PrefetchEntry[]): string[] {
  const pf = entries.filter((e) => /\.pf$/i.test(e.name))
  if (pf.length >= MIN_EXPECTED_PREFETCH_FILES) return []
  return [
    `${TRACE_PREFIX} Prefetch folder holds only ${pf.length} file(s) — execution history may have been deleted`
  ]
}

/** Trace cleaners whose prefetch entry shows a run within the reporting window. */
export function assessCleanerRuns(entries: PrefetchEntry[], nowMs: number): string[] {
  const latest = new Map<string, number>()
  for (const e of entries) {
    const exe = e.name.replace(/-[0-9A-F]{8}\.pf$/i, '').toUpperCase()
    const tool = TRACE_CLEANERS[exe]
    if (!tool) continue
    if (nowMs - e.mtimeMs > CLEANER_WINDOW_MS) continue
    latest.set(tool, Math.max(latest.get(tool) ?? 0, e.mtimeMs))
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tool, when]) => `${TRACE_PREFIX} ${tool} was run ${formatWhen(when, nowMs)}`)
}

/** Every `TimeCreated SystemTime` in `wevtutil qe … /f:xml` output, as epoch ms. */
export function parseEventTimes(xml: string): number[] {
  const out: number[] = []
  const re = /<TimeCreated\s+SystemTime=['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const t = Date.parse(m[1])
    if (!Number.isNaN(t)) out.push(t)
  }
  return out
}

/**
 * Event-log clears within the window. System event 104 = "a log was cleared"
 * (any channel); Security event 1102 = "the audit log was cleared".
 */
export function assessLogClears(
  systemClears: number[],
  securityClears: number[],
  nowMs: number
): string[] {
  const recent = (times: number[]): number | null => {
    const inWindow = times.filter((t) => nowMs - t <= LOG_CLEAR_WINDOW_MS && t <= nowMs + 60_000)
    return inWindow.length ? Math.max(...inWindow) : null
  }
  const out: string[] = []
  const sys = recent(systemClears)
  if (sys !== null) out.push(`${TRACE_PREFIX} A Windows event log was cleared ${formatWhen(sys, nowMs)}`)
  const sec = recent(securityClears)
  if (sec !== null) out.push(`${TRACE_PREFIX} The Security audit log was cleared ${formatWhen(sec, nowMs)}`)
  return out
}

// ── System tampering: components switched off so checks or tools can't run ──

/** Label for findings about blocked tools / disabled components. */
export const TAMPER_PREFIX = '[System tampering]'

/**
 * Programs a checker (or Custos itself) relies on. Blocking any of these from
 * starting has no everyday purpose on a gaming PC.
 */
export const CHECKER_TOOLS: ReadonlySet<string> = new Set([
  // Windows tools checkers open by hand
  'taskmgr.exe', 'regedit.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'eventvwr.exe', 'resmon.exe', 'perfmon.exe',
  // Tools Custos runs under the hood — blocking them silently empties scanners
  'reg.exe', 'wevtutil.exe', 'schtasks.exe', 'tasklist.exe', 'ipconfig.exe', 'fsutil.exe', 'mountvol.exe', 'whoami.exe',
  // Sysinternals / process inspectors
  'procexp.exe', 'procexp64.exe', 'procexp64a.exe', 'procmon.exe', 'procmon64.exe', 'autoruns.exe', 'autoruns64.exe',
  'tcpview.exe', 'tcpview64.exe', 'systeminformer.exe', 'processhacker.exe',
  // File / history viewers used in manual checks
  'everything.exe', 'everything64.exe', 'lastactivityview.exe', 'usbdeview.exe', 'shellbagsview.exe',
  'shellbagsexplorer.exe', 'browsinghistoryview.exe', 'executedprogramslist.exe', 'winprefetchview.exe',
  // Custos itself
  'custos.exe', 'custos-x64.exe', 'custos-arm64.exe'
])

/** Legit IFEO use: Process Explorer / System Informer "Replace Task Manager". */
const TASKMGR_REPLACEMENTS = /\b(procexp(64a?)?|systeminformer|processhacker)\.exe\b/i

export interface IfeoDebugger {
  exe: string
  debugger: string
}

/**
 * Parse `reg query "<IFEO key>" /s /v Debugger` output into (exe, debugger)
 * pairs. Key lines start with HKEY_; value lines are `Debugger REG_SZ data`.
 * Only structure is parsed, so localized "End of search" lines don't matter.
 */
export function parseIfeoDebuggers(output: string): IfeoDebugger[] {
  const out: IfeoDebugger[] = []
  let exe: string | null = null
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^HKEY_/i.test(line)) {
      const m = /Image File Execution Options\\([^\\]+)$/i.exec(line)
      exe = m ? m[1].toLowerCase() : null
      continue
    }
    const v = /^Debugger\s+REG_(?:EXPAND_)?SZ\s+(.*)$/i.exec(line)
    if (v && exe) out.push({ exe, debugger: v[1].trim() })
  }
  return out
}

/** Checker tools redirected via IFEO "Debugger" so they cannot start. */
export function assessIfeoBlocking(entries: IfeoDebugger[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const { exe, debugger: dbg } of entries) {
    if (!CHECKER_TOOLS.has(exe) || seen.has(exe) || !dbg) continue
    if (exe === 'taskmgr.exe' && TASKMGR_REPLACEMENTS.test(dbg)) continue
    seen.add(exe)
    out.push(`${TAMPER_PREFIX} ${exe} is blocked from starting — Image File Execution Options redirects it to "${dbg}"`)
  }
  return out
}

/** Parse the value lines of `reg query <key>` (no /s): name → data. */
export function parseRegValues(output: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const raw of output.split(/\r?\n/)) {
    const v = /^\s+(\S(?:.*?\S)?)\s+REG_[A-Z_]+\s+(.*)$/.exec(raw)
    if (v) m.set(v[1].toLowerCase(), v[2].trim())
  }
  return m
}

/**
 * DisallowRun: Explorer refuses to start the listed programs. Only enabled
 * lists that name checker tools are reported — parents commonly use the same
 * policy to block games, which is none of our business.
 */
export function assessDisallowRun(enabled: number | null, listOutput: string): string[] {
  if (enabled !== 1) return []
  const blocked = [...parseRegValues(listOutput).values()]
    .map((v) => v.toLowerCase())
    .filter((v) => CHECKER_TOOLS.has(v))
  if (blocked.length === 0) return []
  return [`${TAMPER_PREFIX} Windows policy DisallowRun blocks checking tools: ${[...new Set(blocked)].join(', ')}`]
}

export interface ToolPolicies {
  disableTaskMgr: number | null
  disableRegistryTools: number | null
  disableCmd: number | null
}

/** Group-policy switches that disable the tools used in a manual check. */
export function assessToolPolicies(p: ToolPolicies): string[] {
  const out: string[] = []
  if (p.disableTaskMgr === 1) {
    out.push(`${TAMPER_PREFIX} Task Manager is disabled by policy (DisableTaskMgr) — running processes cannot be inspected`)
  }
  if (p.disableRegistryTools !== null && p.disableRegistryTools >= 1) {
    out.push(`${TAMPER_PREFIX} Registry Editor is disabled by policy (DisableRegistryTools = ${p.disableRegistryTools})`)
  }
  if (p.disableCmd !== null && p.disableCmd >= 1) {
    out.push(`${TAMPER_PREFIX} Command Prompt is disabled by policy (DisableCMD = ${p.disableCmd})`)
  }
  return out
}

/** Service Start value 4 = disabled. Null (service absent / unreadable) is ignored. */
export function assessDisabledServices(start: { eventLog: number | null; bam: number | null; dnsCache: number | null }): string[] {
  const out: string[] = []
  if (start.eventLog === 4) {
    out.push(`${TAMPER_PREFIX} The Windows Event Log service is disabled — system events, including log clears, are not recorded`)
  }
  if (start.bam === 4) {
    out.push(`${TAMPER_PREFIX} The BAM driver is disabled — program launches are not recorded in BAM`)
  }
  if (start.dnsCache === 4) {
    out.push(`${TAMPER_PREFIX} The DNS Client service is disabled — visited domains are not cached`)
  }
  return out
}

/**
 * reg.exe itself refused to run (DisableRegistryTools = 1 blocks it too).
 * Every registry-based check — BAM, Amcache, ShellBags, Registry — then
 * returns nothing, so say so explicitly.
 */
export function assessRegBlocked(stderrs: string[]): string[] {
  // English and Russian Windows wording of the same reg.exe refusal.
  const blocked = stderrs.some((e) =>
    /registry editing has been disabled by your administrator|редактирование реестра запрещено/i.test(e)
  )
  return blocked
    ? [`${TAMPER_PREFIX} reg.exe is blocked by policy — registry-based checks (BAM, Amcache, ShellBags, Registry) cannot read anything`]
    : []
}
