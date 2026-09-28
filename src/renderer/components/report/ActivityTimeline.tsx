import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScanReport } from '../../../shared/types'
import { Card, CardContent } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { featureName } from '../../utils/feature-i18n'
import { buildTimeline, groupTimeline, relativeToScan, severityChipClass } from '../../utils/report-view'

const COLLAPSED_COUNT = 8

/**
 * Reverse-chronological strip of every timestamped lead. Entries from the
 * 24 h before the scan are highlighted: activity bunched right before a check
 * (a cheat's last run, then a cleaner) is often the most telling pattern.
 * Bursts of the same lead (many pages of one cheat shop) fold into one row.
 */
export function ActivityTimeline({ report, bare = false }: { report: ScanReport; bare?: boolean }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set())
  const groups = groupTimeline(buildTimeline(report))
  if (groups.length === 0) return null

  const shown = expanded ? groups : groups.slice(0, COLLAPSED_COUNT)
  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const body = (
    <>
      <ol className="relative ml-2 border-l border-[color:var(--line)]">
        {shown.map(({ head, rest }) => {
          const { finding, at, minutesBeforeScan, recent } = head
          const scanner = report.scanners.find((s) => s.id === finding.scannerId)
          const open = openGroups.has(finding.id)
          return (
            <li key={finding.id} className="relative pl-5 pb-4 last:pb-0">
              <span
                className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[color:var(--panel)] ${
                  recent ? 'bg-alert' : 'bg-ink-dim/50'
                }`}
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-mono text-ink">{fmt.format(at)}</span>
                <span className={`text-xs ${recent ? 'text-alert' : 'text-ink-dim'}`}>
                  {relativeToScan(t, minutesBeforeScan)}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityChipClass(finding.severity)}`}>
                  {t(`severity.${finding.severity}`)}
                </span>
                {rest.length > 0 && (
                  <button
                    onClick={() => toggleGroup(finding.id)}
                    aria-expanded={open}
                    className="px-1.5 py-0.5 rounded bg-panel-2 text-[10px] font-semibold text-ink-dim hover:text-ink transition-colors"
                  >
                    {open ? t('timeline.hideSimilar') : t('timeline.similar', { count: rest.length })}
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-dim mt-0.5">
                {featureName(t, finding.scannerId, scanner?.name ?? finding.scannerId)}
                {finding.matched && finding.category !== 'hash' && (
                  <span className="ml-1.5 font-mono text-ink">{finding.matched}</span>
                )}
              </p>
              <p className="text-xs text-ink-dim/80 font-mono break-all mt-0.5">{finding.value}</p>
              {open && (
                <ul className="mt-2 space-y-1.5 border-l border-[color:var(--line)] pl-3">
                  {rest.map((e) => (
                    <li key={e.finding.id} className="text-xs text-ink-dim/80 font-mono break-all">
                      <span className="text-ink-dim">{fmt.format(e.at)}</span> · {e.finding.value}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {groups.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-scan hover:underline"
        >
          {expanded ? t('timeline.showLess') : t('timeline.showAll', { count: groups.length })}
        </button>
      )}
    </>
  )

  if (bare) return <div>{body}</div>

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-sm font-bold text-ink font-display">{t('timeline.title')}</h3>
          <InfoTip title={t('timeline.title')} text={t('timeline.hint')} />
        </div>
        {body}
      </CardContent>
    </Card>
  )
}
