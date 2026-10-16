import type { AnalyzedFinding, ScanReport, Severity, VerdictBand } from '../../shared/types'
import { buildTimeline } from './report-view'

/** Most severe first. */
export const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

export function severityRank(sev: Severity): number {
  return RANK[sev] ?? RANK.info
}

/** Findings that still count: not dismissed as a false positive, not ignored by signature. */
export function activeFindings(report: ScanReport | null): AnalyzedFinding[] {
  return report ? report.findings.filter((f) => !f.dismissed && !f.whitelisted) : []
}

/** How many active findings there are per severity (info included). */
export function severityCounts(report: ScanReport | null): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const f of activeFindings(report)) counts[f.severity] += 1
  return counts
}

/** Theme-token classes that colour one verdict band across the page. */
export interface BandTone {
  /** Text colour of the band name and score. */
  text: string
  /** Stroke colour of the risk ring. */
  stroke: string
  /** Soft background wash of the hero. */
  wash: string
  /** Border colour of the hero. */
  border: string
  /** Solid badge (band chip). */
  badge: string
}

export function bandTone(band: VerdictBand): BandTone {
  switch (band) {
    case 'critical':
    case 'high':
      return { text: 'text-alert', stroke: 'stroke-alert', wash: 'from-alert/[0.14]', border: 'border-alert/40', badge: 'bg-alert/15 text-alert' }
    case 'medium':
      return { text: 'text-amber', stroke: 'stroke-amber', wash: 'from-amber/[0.12]', border: 'border-amber/40', badge: 'bg-amber/15 text-amber' }
    default:
      return { text: 'text-scan', stroke: 'stroke-scan', wash: 'from-scan/[0.10]', border: 'border-scan/30', badge: 'bg-scan/10 text-scan' }
  }
}

/** The coloured stripe on the left edge of a finding row. */
export function severityStripe(sev: Severity): string {
  switch (sev) {
    case 'critical': return 'bg-alert'
    case 'high': return 'bg-alert/70'
    case 'medium': return 'bg-amber'
    case 'low': return 'bg-ink-dim/40'
    case 'info': return 'bg-ink-dim/20'
  }
}

export interface EvidenceFilter {
  /** Severities to show; empty = all of them. */
  severities: ReadonlySet<Severity>
  query: string
  /** Include informational context (Steam accounts, installed software…). */
  showInfo: boolean
  /** Include findings dismissed or ignored by the checker (shown struck through). */
  showSuppressed: boolean
}

/** Findings that pass the filter, most severe first, then by text. */
export function filterFindings(report: ScanReport | null, filter: EvidenceFilter): AnalyzedFinding[] {
  if (!report) return []
  const q = filter.query.trim().toLowerCase()
  return report.findings
    .filter((f) => (filter.showSuppressed ? true : !f.dismissed && !f.whitelisted))
    .filter((f) => (filter.showInfo ? true : f.severity !== 'info'))
    .filter((f) => filter.severities.size === 0 || filter.severities.has(f.severity))
    .filter((f) => !q || f.value.toLowerCase().includes(q) || (f.matched ?? '').toLowerCase().includes(q) || f.scannerId.includes(q))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.value.localeCompare(b.value))
}

export type Grouping = 'severity' | 'scanner' | 'flat'

export interface FindingGroup {
  /** Severity or scanner id (empty for a flat list). */
  key: string
  items: AnalyzedFinding[]
}

/** Groups in a stable order: severities most severe first, scanners by their worst finding. */
export function groupFindings(findings: AnalyzedFinding[], grouping: Grouping): FindingGroup[] {
  if (grouping === 'flat') return findings.length ? [{ key: '', items: findings }] : []
  const map = new Map<string, AnalyzedFinding[]>()
  for (const f of findings) {
    const key = grouping === 'severity' ? f.severity : f.scannerId
    const list = map.get(key)
    if (list) list.push(f)
    else map.set(key, [f])
  }
  const groups = [...map.entries()].map(([key, items]) => ({ key, items }))
  if (grouping === 'severity') return groups.sort((a, b) => severityRank(a.key as Severity) - severityRank(b.key as Severity))
  return groups.sort(
    (a, b) =>
      severityRank(a.items[0].severity) - severityRank(b.items[0].severity) ||
      b.items.length - a.items.length ||
      a.key.localeCompare(b.key)
  )
}

export type ScannerState = 'failed' | 'partial' | 'hit' | 'info' | 'clean'

/**
 * What one scanner's tile should say: it did not run, it read only part of its
 * source, it found evidence, it only gathered system information, or it found
 * nothing.
 */
export function scannerState(
  scanner: { success: boolean; partial?: string },
  evidence: number,
  total: number
): ScannerState {
  if (!scanner.success) return 'failed'
  if (evidence > 0) return 'hit'
  if (scanner.partial) return 'partial'
  return total > 0 ? 'info' : 'clean'
}

/** Timestamped leads that happened in the 24 hours before the scan. */
export function recentActivityCount(report: ScanReport | null): number {
  return buildTimeline(report).filter((e) => e.recent && e.finding.severity !== 'info').length
}
