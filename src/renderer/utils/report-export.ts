import type { TFunction } from 'i18next'
import type { AnalyzedFinding, ScanReport, ScanResult } from '../../shared/types'
import { GAMES } from '../../shared/games'
import { SCANNER_DISPLAY_TO_ID } from '../../shared/scanners-meta'
import { featureName } from './feature-i18n'
import { buildTimeline, rankedCorrelations, reasonText, relativeToScan } from './report-view'

/** Who was checked and by whom — typed by the checker, not part of the hashed report. */
export interface CaseInfo {
  /** Player nickname / SteamID being checked. */
  player?: string
  /** Signed-in Custos user who ran the check. */
  checkedBy?: string
  /** Free-form checker notes. */
  notes?: string
}

function hasCase(c?: CaseInfo): c is CaseInfo {
  return !!c && !!(c.player?.trim() || c.checkedBy?.trim() || c.notes?.trim())
}

/** Identifies the JSON export so other tooling can recognise and version it. */
export const REPORT_FORMAT = 'custos-scan-report'
export const REPORT_FORMAT_VERSION = 1

const RULE = '='.repeat(72)
const THIN = '-'.repeat(72)

/** File name stem shared by every export of one scan: custos-<date>-<scan id>. */
export function exportFileStem(report: ScanReport | null, now = new Date()): string {
  const date = (report?.meta.scannedAt ?? now.toISOString()).slice(0, 10)
  const id = report?.id ? `-${report.id.replace(/[^A-Za-z0-9_-]/g, '')}` : ''
  return `custos-${date}${id}`
}

function scannerLabel(t: TFunction, id: string, fallback: string): string {
  return featureName(t, id, fallback)
}

function formatDuration(t: TFunction, ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} ${t('report.unitSec')}` : `${ms} ${t('report.unitMs')}`
}

function indent(text: string, pad: string): string {
  return text.split('\n').map((l) => pad + l).join('\n')
}

function findingBlock(t: TFunction, f: AnalyzedFinding, report: ScanReport): string {
  const scanner = report.scanners.find((s) => s.id === f.scannerId)
  // Informational items carry no confidence: they are facts about the PC.
  const grade = f.severity === 'info'
    ? t('severity.info').toUpperCase()
    : `${t(`severity.${f.severity}`).toUpperCase()} · ${t(`confidence.${f.confidence}`)}`
  const head =
    `[${grade}] ` +
    `${scannerLabel(t, f.scannerId, scanner?.name ?? f.scannerId)}` +
    (f.matched && f.category !== 'hash' ? `  {${f.matched}}` : '')
  return `  ${head}\n${indent(f.value, '      ')}`
}

/**
 * Build a human-readable, localized forensic report for a completed scan.
 *
 * Built from the analyzed ScanReport (verdict, correlations, graded findings,
 * per-check status) rather than raw scanner output, so what staff share is the
 * same evidence the app showed — including which checks failed and the report's
 * integrity hash. Falls back to raw results when no report is available.
 */
export function buildTextReport(
  t: TFunction,
  report: ScanReport | null,
  results: ScanResult[],
  locale?: string,
  caseInfo?: CaseInfo
): string {
  const out: string[] = []
  out.push(RULE, t('report.title'), RULE)

  if (!report) {
    for (const r of results) {
      const id = SCANNER_DISPLAY_TO_ID[r.scannerName]
      out.push('', `${id ? scannerLabel(t, id, r.scannerName) : r.scannerName}`)
      out.push(r.findings.length ? indent(r.findings.join('\n'), '  ') : `  ${t('results.noFindings')}`)
    }
    return out.join('\n') + '\n'
  }

  const { meta, verdict } = report
  const scanned = new Date(meta.scannedAt)
  const game = meta.gameId ? GAMES[meta.gameId]?.name ?? meta.gameId : t('report.none')
  const os = meta.os
    ? `${meta.os.name} ${meta.os.version} (${meta.os.arch}, ${t('report.appArch')} ${meta.os.appArch})`
    : t('report.none')

  const field = (label: string, value: string): string => `${(label + ':').padEnd(18)} ${value}`
  out.push(
    ...(caseInfo?.player?.trim() ? [field(t('case.player'), caseInfo.player.trim())] : []),
    ...(caseInfo?.checkedBy?.trim() ? [field(t('case.checkedBy'), caseInfo.checkedBy.trim())] : []),
    field(t('report.scanId'), report.id),
    field(t('report.date'), `${scanned.toLocaleString(locale)} (${meta.scannedAt})`),
    field(t('report.duration'), formatDuration(t, meta.durationMs)),
    field(t('report.game'), game),
    field(t('report.system'), os),
    field(
      'Custos',
      `${meta.appVersion} · ${t('report.engine')} ${meta.engineVersion} · ${t('report.signatures')} ${meta.signatureVersion}`
    )
  )

  if (caseInfo?.notes?.trim()) {
    out.push('', `${t('case.notes')}:`, indent(caseInfo.notes.trim(), '  '))
  }

  // ── Verdict ─────────────────────────────────────────────────────────────
  out.push(
    '',
    THIN,
    `${t('verdict.title').toUpperCase()}: ${t(`verdict.band.${verdict.band}`).toUpperCase()} ` +
      `(${t('verdict.score')} ${verdict.score}/100)`,
    THIN
  )
  for (const r of verdict.reasons) out.push(`  • ${reasonText(t, r)}`)

  // ── Key evidence (correlations) ─────────────────────────────────────────
  const correlations = rankedCorrelations(report)
  if (correlations.length > 0) {
    out.push('', THIN, t('verdict.keyEvidence').toUpperCase(), THIN)
    for (const c of correlations) {
      const where = c.scannerIds
        .map((id) => scannerLabel(t, id, report.scanners.find((s) => s.id === id)?.name ?? id))
        .join(', ')
      out.push(`  "${c.signature}" — ${t('verdict.seenIn', { count: c.strength })}: ${where}`)
    }
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  const timeline = buildTimeline(report)
  if (timeline.length > 0) {
    out.push('', THIN, t('timeline.title').toUpperCase(), THIN)
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
    for (const e of timeline) {
      const scanner = report.scanners.find((s) => s.id === e.finding.scannerId)
      out.push(
        `  ${e.recent ? '!' : ' '} ${fmt.format(e.at)}  (${relativeToScan(t, e.minutesBeforeScan)})  ` +
          `${scannerLabel(t, e.finding.scannerId, scanner?.name ?? e.finding.scannerId)}`,
        indent(e.finding.value, '      ')
      )
    }
  }

  // ── Findings ────────────────────────────────────────────────────────────
  const suppressed = report.findings.filter((f) => f.dismissed || f.whitelisted)
  const active = report.findings.filter((f) => !f.dismissed && !f.whitelisted)
  const evidence = active.filter((f) => f.severity !== 'info')
  const context = active.filter((f) => f.severity === 'info')

  out.push('', THIN, `${t('report.evidence').toUpperCase()} (${evidence.length})`, THIN)
  out.push(evidence.length ? evidence.map((f) => findingBlock(t, f, report)).join('\n') : `  ${t('report.none')}`)

  if (context.length > 0) {
    out.push('', THIN, `${t('report.context').toUpperCase()} (${context.length})`, THIN)
    out.push(context.map((f) => findingBlock(t, f, report)).join('\n'))
  }
  if (suppressed.length > 0) {
    out.push('', THIN, `${t('report.suppressed').toUpperCase()} (${suppressed.length})`, THIN)
    out.push(suppressed.map((f) => findingBlock(t, f, report)).join('\n'))
  }

  // ── Checks ──────────────────────────────────────────────────────────────
  const done = report.scanners.filter((s) => s.success).length
  out.push('', THIN, `${t('report.checks').toUpperCase()} (${done}/${report.scanners.length})`, THIN)
  for (const s of report.scanners) {
    const label = scannerLabel(t, s.id, s.name)
    out.push(
      s.success
        ? `  [OK]   ${label} — ${t('report.findingsCount', { count: s.count })}, ${formatDuration(t, s.durationMs)}`
        : `  [FAIL] ${label} — ${s.error ?? t('report.failed')}`
    )
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  out.push('', THIN, t('verdict.leadsNotProof'))
  if (report.contentHash) out.push(`${t('report.integrity')}: SHA-256 ${report.contentHash}`, t('report.integrityNote'))
  out.push(RULE)
  return out.join('\n') + '\n'
}

/**
 * Machine-readable export: the full analyzed report (verdict, correlations,
 * graded findings, content hash) plus the raw per-scanner results it was
 * derived from, under a versioned envelope.
 */
export function buildJsonReport(
  report: ScanReport | null,
  results: ScanResult[],
  exportedAt = new Date(),
  caseInfo?: CaseInfo
): string {
  return JSON.stringify(
    {
      format: REPORT_FORMAT,
      formatVersion: REPORT_FORMAT_VERSION,
      exportedAt: exportedAt.toISOString(),
      ...(hasCase(caseInfo)
        ? { case: { player: caseInfo.player?.trim() || null, checkedBy: caseInfo.checkedBy?.trim() || null, notes: caseInfo.notes?.trim() || null } }
        : {}),
      report,
      results: results.map((r) => ({
        scannerName: r.scannerName,
        success: r.success,
        error: r.error,
        durationMs: r.duration,
        findings: r.findings
      }))
    },
    null,
    2
  )
}

/** Trigger a browser download of `content` as `fileName`. */
export function downloadText(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  // Revoke after the click has been dispatched so the download is not cut off.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
