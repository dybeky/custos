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
  'environment-only', 'incomplete-coverage', 'trace-cleaning', 'trace-cleaning-with-leads'
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
