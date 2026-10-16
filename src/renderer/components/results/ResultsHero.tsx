import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import type { ScanReport, Severity } from '../../../shared/types'
import { GAMES, type GameId } from '../../../shared/games'
import { reasonText, coverageReason, isCoverageReason } from '../../utils/report-view'
import { SEVERITIES, bandTone, severityCounts } from '../../utils/results-view'
import { dateLocale } from '../../utils/date-locale'
import { RiskRing } from './RiskRing'

interface Props {
  report: ScanReport
  player: string
  evidenceCount: number
  keyEvidenceCount: number
  recentCount: number
  scannersOk: number
  scannersFailed: number
  onExportText: () => void
  onExportHtml: () => void
  onExportJson: () => void
}

const SEGMENT: Record<Severity, string> = {
  critical: 'bg-alert',
  high: 'bg-alert/70',
  medium: 'bg-amber',
  low: 'bg-ink-dim/50',
  info: 'bg-ink-dim/20'
}

/**
 * The top of the page: the verdict at a glance. A ring with the risk score, the
 * band and the main reason, who/when/what was checked, a bar that shows how the
 * findings split by severity, and the numbers a checker reads first.
 */
export function ResultsHero(props: Props) {
  const { report, player, evidenceCount, keyEvidenceCount, recentCount, scannersOk, scannersFailed } = props
  const { t, i18n } = useTranslation()
  const tone = bandTone(report.verdict.band)
  const primary = report.verdict.reasons.find((r) => !isCoverageReason(r))
  const coverage = coverageReason(report)
  const counts = severityCounts(report)
  const total = SEVERITIES.reduce((n, s) => n + counts[s], 0)
  const when = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(report.meta.scannedAt)
  )
  const game = report.meta.gameId && GAMES[report.meta.gameId as GameId] ? GAMES[report.meta.gameId as GameId].name : null
  const seconds = Math.max(1, Math.round(report.meta.durationMs / 1000))

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${tone.wash} via-panel/50 to-panel/30 backdrop-blur-xl ${tone.border} p-6 mb-5`}
    >
      <div className="flex flex-wrap items-center gap-6">
        <RiskRing score={report.verdict.score} band={report.verdict.band} label={t('verdict.score')} />

        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${tone.badge}`}>
              {t(`verdict.band.${report.verdict.band}`)}
            </span>
            <span className="text-[11px] text-ink-dim">{t('verdict.title')}</span>
          </div>
          <h1 className="mt-2 truncate font-display text-2xl font-bold text-ink">
            {player.trim() ? player.trim() : t('results.unnamedPlayer')}
          </h1>
          <p className="mt-1 text-sm text-ink-dim">{primary ? reasonText(t, primary) : report.verdict.rationale}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
            {game && <Chip>{game}</Chip>}
            <Chip>{when}</Chip>
            <Chip>{t('results.tookSeconds', { count: seconds })}</Chip>
            <Chip>v{report.meta.appVersion}</Chip>
          </div>
        </div>

        <ExportMenu onText={props.onExportText} onHtml={props.onExportHtml} onJson={props.onExportJson} />
      </div>

      {coverage && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
          <svg className="mt-px h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{reasonText(t, coverage)}</span>
        </div>
      )}

      {total > 0 && (
        <div className="mt-5">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink/10" role="img" aria-label={t('results.severityMix')}>
            {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <motion.div
                key={s}
                className={SEGMENT[s]}
                initial={{ width: 0 }}
                animate={{ width: `${(counts[s] / total) * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                title={`${t(`severity.${s}`)}: ${counts[s]}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim">
            {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${SEGMENT[s]}`} />
                {t(`severity.${s}`)} <span className="font-semibold text-ink">{counts[s]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label={t('results.statLeads')} value={evidenceCount} tone={evidenceCount > 0 ? 'alert' : 'ok'} />
        <Stat label={t('results.statKey')} value={keyEvidenceCount} tone={keyEvidenceCount > 0 ? 'alert' : 'dim'} />
        <Stat label={t('results.statRecent')} value={recentCount} tone={recentCount > 0 ? 'amber' : 'dim'} />
        <Stat
          label={t('results.statScanners')}
          value={`${scannersOk}/${scannersOk + scannersFailed}`}
          tone={scannersFailed > 0 ? 'amber' : 'ok'}
        />
      </div>

      <p className="mt-4 text-[11px] text-ink-dim/80">{t('verdict.leadsNotProof')}</p>
    </motion.section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-ink/[0.07] px-2 py-0.5">{children}</span>
}

const STAT_TONE = { alert: 'text-alert', amber: 'text-amber', ok: 'text-scan', dim: 'text-ink' } as const

function Stat({ label, value, tone }: { label: string; value: number | string; tone: keyof typeof STAT_TONE }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-bg/40 px-3.5 py-3">
      <div className={`font-display text-2xl font-bold leading-none ${STAT_TONE[tone]}`}>{value}</div>
      <div className="mt-1.5 text-[11px] text-ink-dim">{label}</div>
    </div>
  )
}

/** One button that opens the three export formats. */
function ExportMenu({ onText, onHtml, onJson }: { onText: () => void; onHtml: () => void; onJson: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const item = (label: string, hint: string, run: () => void) => (
    <button
      key={label}
      onClick={() => {
        setOpen(false)
        run()
      }}
      className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-scan/10"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-[11px] text-ink-dim">{hint}</span>
    </button>
  )

  return (
    <div ref={ref} className="relative self-start">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--line-strong)] bg-bg/50 px-4 text-sm font-medium text-ink transition-colors hover:border-scan hover:text-scan"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
        </svg>
        {t('results.export')}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-[color:var(--line-strong)] bg-panel p-1.5 shadow-2xl">
          {item(t('results.exportHTML'), t('results.exportHtmlHint'), onHtml)}
          {item(t('results.exportResults'), t('results.exportTextHint'), onText)}
          {item(t('results.exportJSON'), t('results.exportJsonHint'), onJson)}
        </div>
      )}
    </div>
  )
}
