import type { TFunction } from 'i18next'
import type { HistoryEntry } from '../../shared/history'
import { evidenceMatrix, matrixCounts, type MatrixRow } from '../../shared/case'
import { buildHtmlReport } from './report-html'
import { buildJsonReport, exportFileStem, type CaseInfo } from './report-export'
import { makeZip } from './zip'

/**
 * The case package: one zip with every saved check of a player (HTML to read,
 * JSON to keep), a plain-text summary, and MANIFEST.sha256 so anyone can verify
 * no file was changed after the package was made. Built entirely on this PC.
 */

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
    timeZone: 'UTC'
  }).format(new Date(iso)) + ' UTC'

function safeName(s: string): string {
  return (
    s
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'player'
  )
}

/** The text summary: the checks in order, then which evidence was where. */
export function buildSummaryText(t: TFunction, entries: HistoryEntry[], rows: MatrixRow[]): string {
  const player = entries[entries.length - 1]?.case.player.trim() || '—'
  const out: string[] = []
  out.push(`${t('case.package.summaryTitle')}: ${player}`, '='.repeat(60), '')
  out.push(t('case.package.checksHeading'), '-'.repeat(60))
  entries.forEach((e, i) => {
    const v = e.report.verdict
    out.push(
      `#${i + 1}  ${fmtDate(e.report.meta.scannedAt)}  ${t(`verdict.band.${v.band}`)} (${v.score})`,
      `    ${t('case.package.reportHash')}: ${e.report.contentHash ?? '—'}`
    )
    const notes = e.case.notes.trim()
    if (notes) out.push(`    ${t('case.notes')}: ${notes.replace(/\s*\n\s*/g, ' / ')}`)
  })
  const counts = matrixCounts(rows)
  out.push('', t('case.package.evidenceHeading'), '-'.repeat(60))
  out.push(
    `${t('case.status.cleaned')}: ${counts.cleaned}   ${t('case.status.new')}: ${counts.new}   ` +
      `${t('case.status.persistent')}: ${counts.persistent}   ${t('case.status.intermittent')}: ${counts.intermittent}`,
    t('case.package.legend'),
    ''
  )
  for (const r of rows) {
    out.push(
      `[${r.present.map((p) => (p ? '#' : '.')).join('')}] ${t(`case.status.${r.status}`).toUpperCase()}  ` +
        `(${t(`severity.${r.severity}`)}) ${r.value}`
    )
  }
  if (rows.length === 0) out.push(t('case.package.noEvidence'))
  out.push('', t('verdict.leadsNotProof'))
  return out.join('\n') + '\n'
}

function readmeText(t: TFunction): string {
  return [
    t('case.package.readmeTitle'),
    '='.repeat(60),
    '',
    t('case.package.readmeBody'),
    '',
    '  Windows (PowerShell):  Get-FileHash -Algorithm SHA256 <file>',
    '  Linux / macOS:         sha256sum -c MANIFEST.sha256',
    ''
  ].join('\n')
}

export interface CasePackage {
  fileName: string
  bytes: Uint8Array
  files: string[]
}

/** `entries` oldest first. */
export async function buildCasePackage(opts: {
  t: TFunction
  entries: HistoryEntry[]
  locale?: string
  checkedBy?: string
  now?: Date
}): Promise<CasePackage> {
  const { t, entries, locale, checkedBy } = opts
  const now = opts.now ?? new Date()
  const enc = new TextEncoder()
  const rows = evidenceMatrix(entries.map((e) => e.report))
  const files: Array<{ name: string; data: Uint8Array }> = []

  files.push({ name: 'README.txt', data: enc.encode(readmeText(t)) })
  files.push({ name: 'SUMMARY.txt', data: enc.encode(buildSummaryText(t, entries, rows)) })
  entries.forEach((e, i) => {
    const caseInfo: CaseInfo = { player: e.case.player, notes: e.case.notes, checkedBy }
    const stem = `checks/${String(i + 1).padStart(2, '0')}-${exportFileStem(e.report)}`
    files.push({
      name: `${stem}.html`,
      data: enc.encode(buildHtmlReport(t, e.report, locale, caseInfo))
    })
    files.push({
      name: `${stem}.json`,
      data: enc.encode(buildJsonReport(e.report, e.results, now, caseInfo))
    })
  })

  const manifest: string[] = []
  for (const f of files) manifest.push(`${await sha256Hex(f.data)} *${f.name}`)
  files.push({ name: 'MANIFEST.sha256', data: enc.encode(manifest.join('\n') + '\n') })

  const player = safeName(entries[entries.length - 1]?.case.player ?? '')
  return {
    fileName: `custos-case-${player}-${now.toISOString().slice(0, 10)}.zip`,
    bytes: makeZip(files, now),
    files: files.map((f) => f.name)
  }
}
