import type { AnalyzedFinding, ScanReport, Severity } from '../../shared/types'

export type FindingFilter = 'evidence' | 'info' | 'suppressed' | 'all'

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function isSuppressed(f: AnalyzedFinding): boolean {
  return !!(f.dismissed || f.whitelisted)
}

/** Which bucket a finding falls into for the filter tabs. */
export function bucketOf(f: AnalyzedFinding): Exclude<FindingFilter, 'all'> {
  if (isSuppressed(f)) return 'suppressed'
  return f.severity === 'info' ? 'info' : 'evidence'
}

/** Count per filter tab. */
export function filterCounts(report: ScanReport): Record<FindingFilter, number> {
  const c = { evidence: 0, info: 0, suppressed: 0, all: report.findings.length }
  for (const f of report.findings) c[bucketOf(f)]++
  return c
}

/**
 * Findings for a tab + free-text query (matches the value, the signature or the
 * scanner id), grouped by severity from most to least serious.
 */
export function groupFindings(
  report: ScanReport,
  filter: FindingFilter,
  query: string
): Array<{ severity: Severity; findings: AnalyzedFinding[] }> {
  const q = query.trim().toLowerCase()
  const hits = report.findings.filter((f) => {
    if (filter !== 'all' && bucketOf(f) !== filter) return false
    if (!q) return true
    return (
      f.value.toLowerCase().includes(q) ||
      (f.matched?.toLowerCase().includes(q) ?? false) ||
      f.scannerId.includes(q)
    )
  })
  return ORDER.map((severity) => ({ severity, findings: hits.filter((f) => f.severity === severity) })).filter(
    (g) => g.findings.length > 0
  )
}
