import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import type { ScanReport, Severity } from '../../../shared/types'
import { featureName } from '../../utils/feature-i18n'
import { buildFindingLookup, severityKey, severityChipClass } from '../../utils/report-view'
import {
  SEVERITIES, filterFindings, groupFindings, severityCounts, type Grouping
} from '../../utils/results-view'
import { FindingRow } from '../report/FindingRow'
import { EmptyState } from './EmptyState'

const GROUPINGS: Grouping[] = ['severity', 'scanner', 'flat']

/**
 * Every finding in one list: search it, narrow it by severity, group it by
 * severity or by scanner, and fold groups away. Informational context and
 * findings the checker dismissed stay out of the way until asked for.
 */
export function EvidencePanel({ report }: { report: ScanReport }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [severities, setSeverities] = useState<ReadonlySet<Severity>>(new Set())
  const [grouping, setGrouping] = useState<Grouping>('severity')
  const [showInfo, setShowInfo] = useState(false)
  const [showSuppressed, setShowSuppressed] = useState(false)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())

  const counts = useMemo(() => severityCounts(report), [report])
  const lookup = useMemo(() => buildFindingLookup(report), [report])
  const shown = useMemo(
    () => filterFindings(report, { severities, query, showInfo, showSuppressed }),
    [report, severities, query, showInfo, showSuppressed]
  )
  const groups = useMemo(() => groupFindings(shown, grouping), [shown, grouping])
  const scannerName = (id: string) => featureName(t, id, report.scanners.find((s) => s.id === id)?.name ?? id)
  const suppressedCount = report.findings.filter((f) => f.dismissed || f.whitelisted).length

  const toggleSeverity = (s: Severity) =>
    setSeverities((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  const toggleFold = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('results.searchEvidence')}
            className="h-10 w-full rounded-xl border border-[color:var(--line)] bg-panel/60 pl-9 pr-3 text-sm text-ink placeholder:text-ink-dim/60 focus:border-scan/50 focus:outline-none"
          />
        </div>
        <div className="inline-flex rounded-xl border border-[color:var(--line)] bg-panel/60 p-0.5" role="group" aria-label={t('results.groupBy')}>
          {GROUPINGS.map((g) => (
            <button
              key={g}
              onClick={() => setGrouping(g)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                grouping === g ? 'bg-scan/15 text-scan' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {t(`results.group.${g}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SEVERITIES.filter((s) => s !== 'info' || showInfo || counts.info > 0).map((s) => {
          const on = severities.has(s)
          return (
            <button
              key={s}
              onClick={() => toggleSeverity(s)}
              aria-pressed={on}
              disabled={counts[s] === 0}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-35 ${
                on ? 'border-scan/50 bg-scan/10 text-ink' : 'border-[color:var(--line)] bg-panel/40 text-ink-dim hover:text-ink'
              }`}
            >
              <span className={`rounded px-1 py-px text-[10px] font-bold uppercase ${severityChipClass(s)}`}>{t(`severity.${s}`)}</span>
              {counts[s]}
            </button>
          )
        })}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <Toggle on={showInfo} onChange={setShowInfo} label={t('results.showInfo')} />
        {suppressedCount > 0 && (
          <Toggle on={showSuppressed} onChange={setShowSuppressed} label={t('results.showDismissed', { count: suppressedCount })} />
        )}
        {(severities.size > 0 || query) && (
          <button
            onClick={() => {
              setSeverities(new Set())
              setQuery('')
            }}
            className="ml-auto text-xs text-scan hover:underline"
          >
            {t('results.clearFilters')}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          variant={report.findings.length === 0 ? 'clean' : 'plain'}
          title={report.findings.length === 0 ? t('results.cleanTitle') : undefined}
          text={report.findings.length === 0 ? t('results.cleanText') : (!query && severities.size === 0) ? t('results.noEvidence') : t('results.noEvidenceMatch')}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const isFolded = g.key !== '' && folded.has(g.key)
            return (
              <section key={g.key || 'all'}>
                {g.key !== '' && (
                  <button
                    onClick={() => toggleFold(g.key)}
                    aria-expanded={!isFolded}
                    className="mb-2 flex w-full items-center gap-2 text-left"
                  >
                    <motion.svg animate={{ rotate: isFolded ? -90 : 0 }} className="h-4 w-4 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </motion.svg>
                    {grouping === 'severity' ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityChipClass(g.key as Severity)}`}>
                        {t(`severity.${g.key}`)}
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-ink">{scannerName(g.key)}</span>
                    )}
                    <span className="text-xs text-ink-dim">{g.items.length}</span>
                  </button>
                )}
                <AnimatePresence initial={false}>
                  {!isFolded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-1.5 overflow-hidden"
                    >
                      {g.items.map((f) => (
                        <FindingRow
                          key={f.id}
                          value={f.value}
                          finding={lookup.get(severityKey(f.scannerId, f.value)) ?? f}
                          hideSeverity={grouping === 'severity'}
                          scannerLabel={grouping === 'scanner' ? undefined : scannerName(f.scannerId)}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
        on ? 'bg-scan/15 text-scan' : 'text-ink-dim hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
