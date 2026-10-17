import type { TFunction } from 'i18next'
import type { ScanReport, ScanResult } from '../../shared/types'

type ReportScanner = ScanReport['scanners'][number]

/**
 * Who sent a check, as the site words it ("Alice", or "app · no account" for a
 * check sent without an account), with the "no account" part in the app's language.
 */
export function uploaderLabel(t: TFunction, uploader: string | null | undefined): string {
  if (!uploader) return '—'
  const m = /^(.*?)\s*·\s*no account$/.exec(uploader)
  if (!m) return uploader
  const who = m[1].trim()
  return `${!who || who === 'app' ? t('site.appUploader') : who} · ${t('site.noAccount')}`
}

/**
 * Per-scanner results rebuilt from a report that came from the site: the
 * results screen lists scanners with their findings, and the site keeps only
 * the report (scanners + findings), not the live ScanResult list. The report is
 * foreign data: an entry of the wrong shape (a number in the scanner list, a
 * finding without text) is skipped instead of crashing the page.
 */
export function resultsFromReport(report: ScanReport): ScanResult[] {
  const parsed = new Date(report?.meta?.scannedAt)
  const at = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
  const scanners = Array.isArray(report?.scanners) ? report.scanners : []
  const findings = Array.isArray(report?.findings) ? report.findings : []
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const out: ScanResult[] = []
  for (const s of scanners as unknown[]) {
    if (!s || typeof s !== 'object') continue
    const sc = s as Partial<ReportScanner>
    if (typeof sc.id !== 'string' || typeof sc.name !== 'string') continue
    const values = findings
      .filter((f) => f && typeof f === 'object' && f.scannerId === sc.id && typeof f.value === 'string')
      .map((f) => f.value)
    out.push({
      scannerName: sc.name,
      success: sc.success === true,
      findings: values,
      ...(typeof sc.error === 'string' && sc.error ? { error: sc.error } : {}),
      ...(typeof sc.partial === 'string' && sc.partial ? { partial: sc.partial } : {}),
      startTime: at,
      endTime: at,
      duration: num(sc.durationMs),
      count: num(sc.count),
      hasFindings: values.length > 0
    })
  }
  return out
}
