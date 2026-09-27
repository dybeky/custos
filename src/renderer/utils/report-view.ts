import type { TFunction } from 'i18next'
import type { AnalyzedFinding, Correlation, ScanReport, ScoreReason, Severity, VerdictBand } from '../../shared/types'

export function severityKey(scannerId: string, value: string): string {
  return `${scannerId}\n${value}`
}

/** Map (scannerId,value) → severity so the per-scanner Results view can tag each row. */
export function buildSeverityLookup(report: ScanReport | null): Map<string, Severity> {
  const m = new Map<string, Severity>()
  if (!report) return m
  for (const f of report.findings) m.set(severityKey(f.scannerId, f.value), f.severity)
  return m
}

/** Tailwind classes for a severity chip (tokens already defined in the theme). */
export function severityChipClass(sev: Severity): string {
  switch (sev) {
    case 'critical': return 'bg-alert/15 text-alert'
    case 'high': return 'bg-alert/10 text-alert'
    case 'medium': return 'bg-amber-500/10 text-amber-500'
    case 'low': return 'bg-panel-2 text-ink-dim'
    case 'info': return 'bg-panel-2 text-ink-dim/70'
  }
}

/** Tailwind classes for the verdict band badge. */
export function bandChipClass(band: VerdictBand): string {
  switch (band) {
    case 'critical': return 'bg-alert/15 text-alert'
    case 'high': return 'bg-alert/10 text-alert'
    case 'medium': return 'bg-amber-500/10 text-amber-500'
    case 'low': return 'bg-scan/10 text-scan'
    case 'clean': return 'bg-scan/10 text-scan'
  }
}

/** Stable i18n key suffixes for every verdict reason code the engine emits. */
const REASON_KEYS = new Set([
  'no-findings', 'verified-hash', 'strong-corroboration', 'corroboration',
  'community-hash-uncorroborated', 'multiple-leads', 'lone-match',
  'environment-only', 'incomplete-coverage', 'trace-cleaning', 'trace-cleaning-with-leads', 'defender-cheat'
])

/** Localized text for a verdict reason, falling back to the engine's English. */
export function reasonText(t: TFunction, reason: ScoreReason): string {
  if (!REASON_KEYS.has(reason.code)) return reason.text
  return t(`verdict.reason.${reason.code}`, { ...reason.params, defaultValue: reason.text })
}

/** Findings that count as evidence: not informational, not suppressed. */
export function evidenceFindings(report: ScanReport | null): AnalyzedFinding[] {
  if (!report) return []
  return report.findings.filter(f => f.severity !== 'info' && !f.dismissed && !f.whitelisted)
}

/** The coverage warning reason, if any scanner failed. */
export function coverageReason(report: ScanReport | null): ScoreReason | undefined {
  return report?.verdict.reasons.find(r => r.code === 'incomplete-coverage')
}

/** Correlations ordered strongest first (then by signature for stability). */
export function rankedCorrelations(report: ScanReport | null): Correlation[] {
  if (!report) return []
  return [...report.correlations].sort((a, b) => b.strength - a.strength || a.signature.localeCompare(b.signature))
}

/** Evidence findings reported by one scanner. */
export function scannerEvidenceCount(report: ScanReport, scannerId: string): number {
  return evidenceFindings(report).filter(f => f.scannerId === scannerId).length
}

export interface TimelineEntry {
  finding: AnalyzedFinding
  /** Epoch ms of the activity. */
  at: number
  /** Minutes between the activity and the scan (negative if after it, e.g. clock skew). */
  minutesBeforeScan: number
  /** Happened within the 24 h before the scan — the "prepared for the check" window. */
  recent: boolean
}

const RECENT_WINDOW_MIN = 24 * 60

/**
 * Timestamped findings in reverse-chronological order: what ran, was visited,
 * deleted, plugged in or cleaned, and how long before the scan. Suppressed
 * findings are left out.
 */
export function buildTimeline(report: ScanReport | null): TimelineEntry[] {
  if (!report) return []
  const scanAt = Date.parse(report.meta.scannedAt)
  // Informational events (a USB drive connected…) are included: they are not
  // evidence, but they give the evidence around them its context.
  return report.findings
    .filter((f) => !f.dismissed && !f.whitelisted)
    .filter((f): f is AnalyzedFinding & { observedAt: string } => typeof f.observedAt === 'string')
    .map((finding) => {
      const at = Date.parse(finding.observedAt)
      const minutesBeforeScan = Math.round((scanAt - at) / 60_000)
      return { finding, at, minutesBeforeScan, recent: minutesBeforeScan >= 0 && minutesBeforeScan <= RECENT_WINDOW_MIN }
    })
    .filter((e) => !Number.isNaN(e.at))
    .sort((a, b) => b.at - a.at || a.finding.id.localeCompare(b.finding.id))
}

/** Localized "42 min before the scan" / "3 h …" / "5 days …". */
export function relativeToScan(t: TFunction, minutesBeforeScan: number): string {
  const m = Math.max(0, minutesBeforeScan)
  if (m < 60) return t('timeline.minutesBefore', { count: m })
  if (m < 48 * 60) return t('timeline.hoursBefore', { count: Math.round(m / 60) })
  return t('timeline.daysBefore', { count: Math.round(m / (24 * 60)) })
}

/** Map (scannerId,value) → analyzed finding, for per-row triage actions. */
export function buildFindingLookup(report: ScanReport | null): Map<string, AnalyzedFinding> {
  const m = new Map<string, AnalyzedFinding>()
  if (!report) return m
  for (const f of report.findings) m.set(severityKey(f.scannerId, f.value), f)
  return m
}

/**
 * The local file/folder a finding points at, if any: the first absolute
 * drive-letter path, cut at the separators scanners append (` | …`, ` -> …`,
 * ` [sha256:…]`, ` (…)`). A shortcut finding `a.lnk -> target` yields the
 * target, since that is what the checker wants to see.
 */
export function extractLocalPath(value: string): string | null {
  const target = / -> ([A-Za-z]:\\[^|\n]*)/.exec(value)
  const m = target ?? /(?:^|[\s\]"'])([A-Za-z]:\\[^|\n]*)/.exec(value)
  if (!m) return null
  const path = m[1]
    .split(/ -> | \[sha256:| \(| \| /)[0]
    .replace(/["']+$/, '')
    .trim()
    .replace(/[\\ ]+$/, '')
  return path.length > 3 ? path : null
}

export interface SteamIdentity {
  accountName: string
  steamId: string
  personaName?: string
}

/** Steam accounts the Steam scanner found on the PC — candidates for "who is this player". */
export function steamIdentities(report: ScanReport | null): SteamIdentity[] {
  if (!report) return []
  const out: SteamIdentity[] = []
  const seen = new Set<string>()
  for (const f of report.findings) {
    if (f.scannerId !== 'steam') continue
    const m = /^\[Steam Account\] (.+?) \(SteamID: (\d+)\)(?: - (.+?))?(?: \[Invalid SteamID format\])?$/.exec(f.value)
    if (!m || seen.has(m[2])) continue
    seen.add(m[2])
    out.push({ accountName: m[1], steamId: m[2], personaName: m[3] })
  }
  return out
}

/** "Persona (SteamID)" — the label used when a Steam account fills the player field. */
export function steamIdentityLabel(id: SteamIdentity): string {
  return `${id.personaName ?? id.accountName} (${id.steamId})`
}
