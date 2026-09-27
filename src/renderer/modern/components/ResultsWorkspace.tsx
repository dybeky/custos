import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import type { ScanReport } from '../../../shared/types'
import { useScanStore } from '../../stores/scan-store'
import { useGameStore } from '../../stores/game-store'
import { featureName } from '../../utils/feature-i18n'
import {
  coverageReason, rankedCorrelations, reasonText, severityChipClass, steamIdentities, steamIdentityLabel, buildTimeline
} from '../../utils/report-view'
import { FindingRow } from '../../components/report/FindingRow'
import { ActivityTimeline } from '../../components/report/ActivityTimeline'
import { useExportReport } from '../commands'
import { filterCounts, groupFindings, type FindingFilter } from '../findings-filter'
import { VerdictGauge } from './VerdictGauge'
import { RecheckCard } from '../../components/history/RecheckCard'
import { HistoryBanner } from '../../components/history/HistoryBanner'
import { useNavigate } from 'react-router-dom'
import { IconAlert, IconCheck, IconDownload, IconRefresh, IconSearch, IconX } from '../icons'

type Tab = 'findings' | 'timeline' | 'checks'

const FILTERS: FindingFilter[] = ['evidence', 'info', 'suppressed', 'all']

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

/**
 * The finished-scan workspace. Left: the verdict at a glance (gauge, reason,
 * coverage, numbers, case, export). Right: the evidence to work through —
 * findings by severity with filter/search and triage, the timeline, and the
 * per-check status.
 */
export function ResultsWorkspace({ report }: { report: ScanReport }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { startScan, caseInfo, setCaseInfo, whitelist, unignoreSignature } = useScanStore()
  const { selectedGame } = useGameStore()
  const exportReport = useExportReport()
  const [tab, setTab] = useState<Tab>('findings')
  const [filter, setFilter] = useState<FindingFilter>('evidence')
  const [query, setQuery] = useState('')

  const coverage = coverageReason(report)
  const primary = report.verdict.reasons.find((r) => r.code !== 'incomplete-coverage')
  const counts = filterCounts(report)
  const groups = groupFindings(report, filter, query)
  const correlations = rankedCorrelations(report)
  const timelineCount = buildTimeline(report).length
  const failed = report.scanners.filter((s) => !s.success).length
  const identities = steamIdentities(report)

  const scannerName = (id: string) => featureName(t, id, report.scanners.find((s) => s.id === id)?.name ?? id)

  return (
    <div className="h-full grid grid-cols-[minmax(280px,340px)_1fr] gap-4 p-4 overflow-hidden">
      {/* ── Left rail ─────────────────────────────────────────────────── */}
      <motion.aside
        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col gap-3 overflow-y-auto pr-1"
      >
        <HistoryBanner onBack={() => navigate('/history')} />
        <section className="m-surface p-5">
          <VerdictGauge score={report.verdict.score} band={report.verdict.band} label={t(`verdict.band.${report.verdict.band}`)} />
          <p className="mt-4 text-sm text-ink text-center leading-snug">
            {primary ? reasonText(t, primary) : report.verdict.rationale}
          </p>
          {coverage && (
            <div className="mt-3 flex gap-2 rounded-xl bg-amber/10 border border-amber/25 px-3 py-2 text-[11px] leading-snug text-amber">
              <IconAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>{reasonText(t, coverage)}</span>
            </div>
          )}
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { k: t('modern.stats.leads'), v: counts.evidence, tone: counts.evidence ? 'text-alert' : 'text-ink' },
              { k: t('modern.stats.checks'), v: `${report.scanners.length - failed}/${report.scanners.length}`, tone: failed ? 'text-amber' : 'text-ink' },
              { k: t('modern.stats.time'), v: formatDuration(report.meta.durationMs), tone: 'text-ink' }
            ].map((s) => (
              <div key={s.k} className="rounded-xl bg-panel-2/60 py-2">
                <dd className={`text-base font-semibold tabular-nums ${s.tone}`}>{s.v}</dd>
                <dt className="text-[10px] uppercase tracking-wider text-ink-dim">{s.k}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] text-ink-dim/80 text-center">{t('verdict.leadsNotProof')}</p>
        </section>

        <RecheckCard compact />

        <section className="m-surface p-4">
          <label htmlFor="m-case-player" className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{t('case.player')}</label>
          <input
            id="m-case-player"
            value={caseInfo.player}
            maxLength={200}
            onChange={(e) => setCaseInfo({ player: e.target.value })}
            placeholder={t('case.playerPlaceholder')}
            className="mt-1.5 w-full h-9 px-3 rounded-lg bg-panel-2 border border-[color:var(--line)] text-sm text-ink placeholder:text-ink-dim/60 focus:outline-none focus:border-scan/50"
          />
          {identities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {identities.map((id) => {
                const label = steamIdentityLabel(id)
                return (
                  <button
                    key={id.steamId}
                    onClick={() => setCaseInfo({ player: label })}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors ${
                      caseInfo.player === label ? 'bg-scan/15 text-scan' : 'bg-panel-2 text-ink-dim hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          <label htmlFor="m-case-notes" className="mt-3 block text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{t('case.notes')}</label>
          <textarea
            id="m-case-notes"
            value={caseInfo.notes}
            maxLength={5000}
            onChange={(e) => setCaseInfo({ notes: e.target.value })}
            placeholder={t('case.notesPlaceholder')}
            className="mt-1.5 w-full min-h-[64px] px-3 py-2 rounded-lg bg-panel-2 border border-[color:var(--line)] text-sm text-ink placeholder:text-ink-dim/60 focus:outline-none focus:border-scan/50 resize-y"
          />
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => exportReport('txt')} className="h-10 flex items-center justify-center gap-2 rounded-xl bg-scan text-on-accent text-sm font-semibold hover:brightness-110 transition">
            <IconDownload className="w-4 h-4" /> {t('modern.actions.report')}
          </button>
          <button onClick={() => exportReport('json')} className="h-10 flex items-center justify-center gap-2 rounded-xl border border-[color:var(--line)] text-sm text-ink-dim hover:text-ink transition-colors">
            JSON
          </button>
          <button onClick={() => void startScan(selectedGame ?? undefined)} className="col-span-2 h-9 flex items-center justify-center gap-2 rounded-xl text-xs text-ink-dim hover:text-ink hover:bg-panel-2 transition-colors">
            <IconRefresh className="w-3.5 h-3.5" /> {t('modern.actions.rescan')}
          </button>
        </div>
      </motion.aside>

      {/* ── Right: evidence workspace ─────────────────────────────────── */}
      <section className="m-surface flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-3 pt-3 border-b border-[color:var(--line)]">
          {([
            ['findings', t('modern.tabs.findings'), counts.evidence],
            ['timeline', t('timeline.title'), timelineCount],
            ['checks', t('modern.tabs.checks'), report.scanners.length]
          ] as const).map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative px-3 h-9 text-[13px] font-medium transition-colors ${tab === id ? 'text-ink' : 'text-ink-dim hover:text-ink'}`}
            >
              {label}
              <span className="ml-1.5 text-[11px] tabular-nums text-ink-dim">{n}</span>
              {tab === id && <motion.span layoutId="m-tab" className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-scan" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'findings' && (
            <>
              {correlations.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{t('verdict.keyEvidence')}</p>
                  <div className="flex flex-col gap-1.5">
                    {correlations.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border border-alert/20 bg-alert/[0.06] px-3 py-2">
                        <span className="font-mono text-sm text-ink">{c.signature}</span>
                        <span className="text-xs text-ink-dim truncate">
                          {t('verdict.seenIn', { count: c.strength })}: {c.scannerIds.map(scannerName).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex p-0.5 rounded-lg bg-panel-2/70">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2.5 h-7 rounded-md text-xs transition-colors ${filter === f ? 'bg-panel text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-dim hover:text-ink'}`}
                    >
                      {t(`modern.filter.${f}`)} <span className="tabular-nums text-ink-dim">{counts[f]}</span>
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[160px]">
                  <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('modern.filter.search')}
                    className="w-full h-8 pl-8 pr-3 rounded-lg bg-panel-2/70 border border-transparent text-xs text-ink placeholder:text-ink-dim/60 focus:outline-none focus:border-[color:var(--line-strong)]"
                  />
                </div>
              </div>

              {whitelist.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
                  {t('triage.ignoredTitle')}:
                  {whitelist.map((s) => (
                    <button key={s} onClick={() => void unignoreSignature(s)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-panel-2 font-mono text-ink hover:text-alert" title={t('triage.remove')}>
                      {s} <IconX className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {groups.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto w-11 h-11 rounded-full bg-[#8FBF9F]/10 text-[#8FBF9F] flex items-center justify-center">
                    <IconCheck className="w-5 h-5" />
                  </div>
                  <p className="mt-3 text-sm text-ink">{query ? t('modern.filter.noMatches') : t(`modern.filter.empty.${filter}`)}</p>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.severity} className="mb-4 last:mb-0">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityChipClass(g.severity)}`}>{t(`severity.${g.severity}`)}</span>
                      <span className="text-[11px] tabular-nums text-ink-dim">{g.findings.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.findings.map((f) => (
                        <div key={f.id}>
                          <p className="mb-0.5 px-1 text-[11px] text-ink-dim">
                            {scannerName(f.scannerId)}
                            {f.matched && f.category !== 'hash' && <span className="ml-1.5 font-mono text-scan">{f.matched}</span>}
                          </p>
                          <FindingRow value={f.value} finding={f} hideSeverity />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'timeline' && (
            timelineCount > 0
              ? <ActivityTimeline report={report} bare />
              : <p className="py-16 text-center text-sm text-ink-dim">{t('modern.timelineEmpty')}</p>
          )}

          {tab === 'checks' && (
            <div className="flex flex-col divide-y divide-[color:var(--line)]">
              {report.scanners.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2.5">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center ${s.success ? (s.count ? 'bg-alert/10 text-alert' : 'bg-[#8FBF9F]/10 text-[#8FBF9F]') : 'bg-amber/10 text-amber'}`}>
                    {s.success ? <IconCheck className="w-3.5 h-3.5" /> : <IconX className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{scannerName(s.id)}</p>
                    {!s.success && <p className="text-[11px] text-amber truncate">{s.error ?? t('report.failed')}</p>}
                  </div>
                  <span className="text-xs tabular-nums text-ink-dim">{s.success ? t('report.findingsCount', { count: s.count }) : ''}</span>
                  <span className="w-14 text-right text-xs tabular-nums text-ink-dim">{formatDuration(s.durationMs)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
