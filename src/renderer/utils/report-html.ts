import type { TFunction } from 'i18next'
import type { AnalyzedFinding, ScanReport } from '../../shared/types'
import { GAMES } from '../../shared/games'
import { formatDuration, scannerLabel, type CaseInfo } from './report-export'
import { buildTimeline, rankedCorrelations, reasonText } from './report-view'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Everything in a report comes from the checked PC (file names, URLs): escape it all. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])
}

const BAND_COLOR: Record<string, string> = {
  clean: '#3fb97f',
  low: '#3fb97f',
  medium: '#e0a030',
  high: '#ef5b5b',
  critical: '#ef5b5b'
}

const STYLE = `
:root{color-scheme:dark light}
*{box-sizing:border-box}
body{margin:0;background:#0b0b0d;color:#ecebe6;font:15px/1.5 system-ui,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:32px 20px 64px}
h1{margin:0 0 4px;font-size:26px}
h2{margin:36px 0 10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#9a998f}
.sub{color:#9a998f;margin:0 0 24px}
.verdict{display:flex;align-items:center;gap:18px;border:1px solid #2a2a2e;border-radius:14px;padding:18px 20px;background:#141417}
.score{font-size:38px;font-weight:700;line-height:1}
.band{font-weight:700;text-transform:uppercase;letter-spacing:.08em}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin:0}
dt{color:#9a998f}dd{margin:0;word-break:break-word}
ul{margin:8px 0;padding-left:20px}
.item{border:1px solid #2a2a2e;border-radius:10px;padding:10px 14px;margin:8px 0;background:#141417}
.item b{font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.item code{display:block;margin-top:4px;font:13px ui-monospace,Consolas,monospace;word-break:break-all;color:#cfcfc8}
.ok{color:#3fb97f}.fail{color:#ef5b5b}
.note{margin-top:36px;padding-top:14px;border-top:1px solid #2a2a2e;color:#9a998f;font-size:13px}
.hash{font:12px ui-monospace,Consolas,monospace;word-break:break-all}
@media print{body{background:#fff;color:#111}.item,.verdict{background:#fff;border-color:#bbb}.item code{color:#222}h2,.sub,dt,.note{color:#555}}
`

function finding(t: TFunction, f: AnalyzedFinding, report: ScanReport): string {
  const scanner = report.scanners.find((s) => s.id === f.scannerId)
  const grade =
    f.severity === 'info'
      ? t('severity.info')
      : `${t(`severity.${f.severity}`)} · ${t(`confidence.${f.confidence}`)}`
  const matched = f.matched && f.category !== 'hash' ? ` {${f.matched}}` : ''
  return (
    `<div class="item"><b>${esc(grade)} — ${esc(scannerLabel(t, f.scannerId, scanner?.name ?? f.scannerId))}` +
    `${esc(matched)}</b><code>${esc(f.value)}</code></div>`
  )
}

/**
 * A self-contained, printable HTML version of the same report the text export
 * holds: verdict, key evidence, findings, checks and the integrity hash. No
 * scripts and no external resources, so it opens anywhere and can be attached
 * to a message as is (or printed to PDF from the browser).
 */
export function buildHtmlReport(
  t: TFunction,
  report: ScanReport,
  locale?: string,
  caseInfo?: CaseInfo
): string {
  const { meta, verdict } = report
  const game = meta.gameId ? (GAMES[meta.gameId]?.name ?? meta.gameId) : t('report.none')
  const os = meta.os
    ? `${meta.os.name} ${meta.os.version} (${meta.os.arch}, ${t('report.appArch')} ${meta.os.appArch})`
    : t('report.none')
  const rows: Array<[string, string]> = []
  if (caseInfo?.player?.trim()) rows.push([t('case.player'), caseInfo.player.trim()])
  if (caseInfo?.checkedBy?.trim()) rows.push([t('case.checkedBy'), caseInfo.checkedBy.trim()])
  rows.push(
    [t('report.scanId'), report.id],
    [t('report.date'), `${new Date(meta.scannedAt).toLocaleString(locale)} (${meta.scannedAt})`],
    [t('report.duration'), formatDuration(t, meta.durationMs)],
    [t('report.game'), game],
    [t('report.system'), os],
    [
      'Custos',
      `${meta.appVersion} · ${t('report.engine')} ${meta.engineVersion} · ${t('report.signatures')} ${meta.signatureVersion}`
    ]
  )

  const active = report.findings.filter((f) => !f.dismissed && !f.whitelisted)
  const evidence = active.filter((f) => f.severity !== 'info')
  const context = active.filter((f) => f.severity === 'info')
  const section = (title: string, body: string): string => `<h2>${esc(title)}</h2>${body}`
  const list = (items: AnalyzedFinding[]): string =>
    items.length
      ? items.map((f) => finding(t, f, report)).join('')
      : `<p>${esc(t('report.none'))}</p>`

  const out: string[] = []
  out.push(
    `<h1>${esc(t('report.title'))}</h1>`,
    `<p class="sub">${esc(report.id)}</p>`,
    `<div class="verdict"><div class="score" style="color:${BAND_COLOR[verdict.band] ?? '#ecebe6'}">${esc(verdict.score)}<small>/100</small></div>` +
      `<div><div class="band" style="color:${BAND_COLOR[verdict.band] ?? '#ecebe6'}">${esc(t(`verdict.band.${verdict.band}`))}</div>` +
      `<ul>${verdict.reasons.map((r) => `<li>${esc(reasonText(t, r))}</li>`).join('')}</ul></div></div>`,
    section(
      t('report.scanId'),
      `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
    )
  )
  if (caseInfo?.notes?.trim()) {
    out.push(
      section(t('case.notes'), `<p>${esc(caseInfo.notes.trim()).replace(/\n/g, '<br>')}</p>`)
    )
  }

  const correlations = rankedCorrelations(report)
  if (correlations.length > 0) {
    out.push(
      section(
        t('verdict.keyEvidence'),
        `<ul>${correlations
          .map((c) => {
            const where = c.scannerIds
              .map((id) =>
                scannerLabel(t, id, report.scanners.find((s) => s.id === id)?.name ?? id)
              )
              .join(', ')
            return `<li>“${esc(c.signature)}” — ${esc(t('verdict.seenIn', { count: c.strength }))}: ${esc(where)}</li>`
          })
          .join('')}</ul>`
      )
    )
  }

  const timeline = buildTimeline(report)
  if (timeline.length > 0) {
    const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' })
    out.push(
      section(
        t('timeline.title'),
        timeline
          .map((e) => {
            const scanner = report.scanners.find((s) => s.id === e.finding.scannerId)
            return (
              `<div class="item"><b>${esc(fmt.format(e.at))} — ` +
              `${esc(scannerLabel(t, e.finding.scannerId, scanner?.name ?? e.finding.scannerId))}</b>` +
              `<code>${esc(e.finding.value)}</code></div>`
            )
          })
          .join('')
      )
    )
  }

  out.push(section(`${t('report.evidence')} (${evidence.length})`, list(evidence)))
  if (context.length > 0)
    out.push(section(`${t('report.context')} (${context.length})`, list(context)))

  const done = report.scanners.filter((s) => s.success).length
  out.push(
    section(
      `${t('report.checks')} (${done}/${report.scanners.length})`,
      `<ul>${report.scanners
        .map((s) => {
          const label = esc(scannerLabel(t, s.id, s.name))
          return s.success
            ? `<li><span class="ok">OK</span> ${label} — ${esc(t('report.findingsCount', { count: s.count }))}, ${esc(formatDuration(t, s.durationMs))}${s.partial ? ` (${esc(s.partial)})` : ''}</li>`
            : `<li><span class="fail">FAIL</span> ${label} — ${esc(s.error ?? t('report.failed'))}</li>`
        })
        .join('')}</ul>`
    ),
    `<div class="note">${esc(t('verdict.leadsNotProof'))}` +
      (report.contentHash
        ? `<br><br>${esc(t('report.integrity'))}: SHA-256 <span class="hash">${esc(report.contentHash)}</span><br>${esc(t('report.integrityNote'))}`
        : '') +
      `</div>`
  )

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<title>${esc(t('report.title'))} ${esc(report.id)}</title><style>${STYLE}</style></head>` +
    `<body><main>${out.join('')}</main></body></html>\n`
  )
}
