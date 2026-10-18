import type { ScanReport } from '../../shared/types'

/**
 * When the checker chose to ignore something: a signature or a single finding.
 * Kept in memory for this launch (Custos stores nothing on the PC) and written
 * into the report as `suppressedAt`, so whoever opens the check on the site sees
 * when a finding was set aside.
 */
export class SuppressionClock {
  private at = new Map<string, string>()

  /** Stamp every ignored finding of `report`; a choice keeps the time it was first made. */
  stamp(report: ScanReport, whitelist: string[], dismissedIds: string[], now = new Date()): ScanReport {
    const keys = new Set([...whitelist.map((s) => `sig:${s.toLowerCase()}`), ...dismissedIds.map((id) => `id:${id}`)])
    for (const k of this.at.keys()) if (!keys.has(k)) this.at.delete(k) // un-ignored: forget
    for (const k of keys) if (!this.at.has(k)) this.at.set(k, now.toISOString())
    for (const f of report.findings) {
      const times = [
        f.whitelisted && f.matched ? this.at.get(`sig:${f.matched.toLowerCase()}`) : undefined,
        f.dismissed ? this.at.get(`id:${f.id}`) : undefined
      ].filter((x): x is string => !!x)
      if (times.length) f.suppressedAt = times.sort()[0]
      else delete f.suppressedAt
    }
    return report
  }
}
