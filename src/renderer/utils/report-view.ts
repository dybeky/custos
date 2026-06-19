import type { ScanReport, Severity, VerdictBand } from '../../shared/types'

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
