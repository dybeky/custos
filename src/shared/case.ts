import type { AnalyzedFinding, ScanReport, Severity, VerdictBand } from './types'
import { findingIdentity, type HistorySummary } from './history'

/**
 * Case mode: everything the app knows about ONE player, across all of that
 * player's saved checks. Pure functions (no DOM, no IPC) so they are unit-tested.
 */

/** A player with at least one saved check, for the list of cases. */
export interface CaseListItem {
  key: string
  /** The player's label from the newest check. */
  player: string
  checks: number
  lastAt: string
  lastBand: VerdictBand
  lastScore: number
}

/** The cases (players that can be told apart), the most recently checked first. */
export function listCases(summaries: HistorySummary[]): CaseListItem[] {
  const byKey = new Map<string, HistorySummary[]>()
  for (const s of summaries) {
    if (!s.playerKey) continue
    const list = byKey.get(s.playerKey)
    if (list) list.push(s)
    else byKey.set(s.playerKey, [s])
  }
  return [...byKey.entries()]
    .map(([key, list]) => {
      const newest = [...list].sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))[0]
      return {
        key,
        player: newest.player,
        checks: list.length,
        lastAt: newest.scannedAt,
        lastBand: newest.band,
        lastScore: newest.score
      }
    })
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
}

/** The checks of one player, oldest first. */
export function caseChecks(summaries: HistorySummary[], key: string): HistorySummary[] {
  return summaries
    .filter((s) => s.playerKey === key)
    .sort((a, b) => Date.parse(a.scannedAt) - Date.parse(b.scannedAt))
}

/**
 * How a piece of evidence behaves across the checks:
 *  - cleaned: it was there before and is gone in the newest check (deleted)
 *  - new: it was not in the first check but is in the newest
 *  - persistent: in every check
 *  - intermittent: comes and goes
 */
export type EvidenceStatus = 'cleaned' | 'new' | 'persistent' | 'intermittent'

export interface MatrixRow {
  identity: string
  scannerId: string
  /** The finding text as of the newest check that had it (times are cut out of the identity, not of this). */
  value: string
  matched: string | null
  severity: Severity
  /** One flag per check, oldest first. */
  present: boolean[]
  status: EvidenceStatus
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }

export function evidenceStatus(present: boolean[]): EvidenceStatus {
  const last = present[present.length - 1]
  if (!last) return 'cleaned'
  if (present.every(Boolean)) return 'persistent'
  if (!present[0]) return 'new'
  return 'intermittent'
}

function isEvidence(f: AnalyzedFinding): boolean {
  return f.severity !== 'info' && !f.dismissed && !f.whitelisted
}

const STATUS_ORDER: Record<EvidenceStatus, number> = {
  cleaned: 0,
  new: 1,
  intermittent: 2,
  persistent: 3
}

/**
 * Which evidence was present in which check (reports oldest first). The rows
 * that matter most come first: what was cleaned between checks, then what is
 * new, then the rest by severity.
 */
export function evidenceMatrix(reports: ScanReport[]): MatrixRow[] {
  const rows = new Map<string, MatrixRow>()
  reports.forEach((report, index) => {
    for (const f of report.findings) {
      if (!isEvidence(f)) continue
      const identity = findingIdentity(f)
      let row = rows.get(identity)
      if (!row) {
        row = {
          identity,
          scannerId: f.scannerId,
          value: f.value,
          matched: f.matched,
          severity: f.severity,
          present: reports.map(() => false),
          status: 'persistent'
        }
        rows.set(identity, row)
      }
      row.present[index] = true
      row.value = f.value
      if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[row.severity]) row.severity = f.severity
    }
  })
  const out = [...rows.values()]
  for (const row of out) row.status = evidenceStatus(row.present)
  return out.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.value.localeCompare(b.value)
  )
}

/** Counts per status, for the case header. */
export function matrixCounts(rows: MatrixRow[]): Record<EvidenceStatus, number> {
  const counts: Record<EvidenceStatus, number> = {
    cleaned: 0,
    new: 0,
    persistent: 0,
    intermittent: 0
  }
  for (const r of rows) counts[r.status]++
  return counts
}
