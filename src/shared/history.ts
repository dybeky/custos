import type { AnalyzedFinding, ScanReport, ScanResult, VerdictBand } from './types'

/** Case details saved with a check. */
export interface HistoryCase {
  player: string
  notes: string
}

/** One saved check (full content). */
export interface HistoryEntry {
  id: string
  savedAt: string
  report: ScanReport
  results: ScanResult[]
  case: HistoryCase
}

/** Lightweight row for listing/searching without loading every report. */
export interface HistorySummary {
  id: string
  scannedAt: string
  player: string
  playerKey: string | null
  band: VerdictBand
  score: number
  leads: number
  gameId: string | null
}

/** Maximum checks kept on disk; the oldest are dropped first. */
export const HISTORY_LIMIT = 100

/**
 * Identity used to match re-checks of the same player: the SteamID64 when the
 * player field contains one (robust to nickname changes), else the
 * case-insensitive, whitespace-collapsed name. Null when empty.
 */
export function playerKey(player: string | null | undefined): string | null {
  const p = (player ?? '').trim()
  if (!p) return null
  const steam = /\b7656119\d{10}\b/.exec(p)
  if (steam) return `steam:${steam[0]}`
  return `name:${p.toLowerCase().replace(/\s+/g, ' ')}`
}

/** Evidence count used in summaries: non-informational, not suppressed. */
export function evidenceCount(report: ScanReport): number {
  return report.findings.filter((f) => f.severity !== 'info' && !f.dismissed && !f.whitelisted).length
}

export function summarize(entry: HistoryEntry): HistorySummary {
  const { report } = entry
  return {
    id: report.id,
    scannedAt: report.meta.scannedAt,
    player: entry.case.player.trim(),
    playerKey: playerKey(entry.case.player),
    band: report.verdict.band,
    score: report.verdict.score,
    leads: evidenceCount(report),
    gameId: report.meta.gameId
  }
}

/**
 * The most recent earlier check of the same player, from summaries sorted
 * any way. Null when the player is unknown or never checked before.
 */
export function findPrevious(summaries: HistorySummary[], currentId: string, currentScannedAt: string, player: string): HistorySummary | null {
  const key = playerKey(player)
  if (!key) return null
  const now = Date.parse(currentScannedAt)
  return (
    summaries
      .filter((s) => s.id !== currentId && s.playerKey === key && Date.parse(s.scannedAt) < now)
      .sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))[0] ?? null
  )
}

/**
 * Identity of a finding across scans: its scanner plus its text with any
 * embedded times removed — a Prefetch "last run" moving forward is the same
 * artifact, not a new one.
 */
export function findingIdentity(f: Pick<AnalyzedFinding, 'scannerId' | 'value'>): string {
  const value = f.value
    .replace(/\b\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}\b/g, '')
    .replace(/\b\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\b/g, '')
    .replace(/\(\d+ (?:min|h|days) ago\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return `${f.scannerId}\n${value}`
}

export interface ReportDiff {
  /** Evidence present now but not in the previous check. */
  added: AnalyzedFinding[]
  /** Evidence in the previous check that is gone now. */
  removed: AnalyzedFinding[]
  unchanged: number
  bandFrom: VerdictBand
  bandTo: VerdictBand
  scoreFrom: number
  scoreTo: number
}

function activeEvidence(r: ScanReport): AnalyzedFinding[] {
  return r.findings.filter((f) => f.severity !== 'info' && !f.dismissed && !f.whitelisted)
}

/** What changed between a player's previous check and this one. */
export function diffReports(prev: ScanReport, curr: ScanReport): ReportDiff {
  const before = new Map(activeEvidence(prev).map((f) => [findingIdentity(f), f]))
  const after = new Map(activeEvidence(curr).map((f) => [findingIdentity(f), f]))
  const added = [...after].filter(([k]) => !before.has(k)).map(([, f]) => f)
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, f]) => f)
  return {
    added,
    removed,
    unchanged: after.size - added.length,
    bandFrom: prev.verdict.band,
    bandTo: curr.verdict.band,
    scoreFrom: prev.verdict.score,
    scoreTo: curr.verdict.score
  }
}
