import type { ScanReport, ScanResult } from '../../shared/types'

/**
 * Per-scanner results rebuilt from a report that came from the site: the
 * results screen lists scanners with their findings, and the site keeps only
 * the report (scanners + findings), not the live ScanResult list.
 */
export function resultsFromReport(report: ScanReport): ScanResult[] {
  const at = new Date(report.meta.scannedAt)
  return report.scanners.map((s) => {
    const findings = report.findings.filter((f) => f.scannerId === s.id).map((f) => f.value)
    return {
      scannerName: s.name,
      success: s.success,
      findings,
      ...(s.error ? { error: s.error } : {}),
      ...(s.partial ? { partial: s.partial } : {}),
      startTime: at,
      endTime: at,
      duration: s.durationMs,
      count: s.count,
      hasFindings: findings.length > 0
    }
  })
}
