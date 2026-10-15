import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { diffReports, type HistoryEntry } from '../../../shared/history'
import { featureName } from '../../utils/feature-i18n'
import { bandChipClass } from '../../utils/report-view'
import { dateLocale } from '../../utils/date-locale'

const SELECT =
  'h-9 rounded-xl bg-panel-2 border border-[color:var(--line)] px-3 text-xs text-ink focus:outline-none focus:border-scan/50'

/**
 * Any two checks of the player side by side: the verdict then and now, and the
 * evidence that appeared or disappeared in between. Defaults to the last two.
 */
export function CompareChecks({ entries }: { entries: HistoryEntry[] }) {
  const { t, i18n } = useTranslation()
  const [from, setFrom] = useState(Math.max(0, entries.length - 2))
  const [to, setTo] = useState(entries.length - 1)
  if (entries.length < 2) return null

  const fmt = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' })
  const label = (i: number) =>
    `${t('casefile.checkLabel', { n: i + 1 })} · ${fmt.format(new Date(entries[i].report.meta.scannedAt))}`
  const options = entries.map((_, i) => (
    <option key={i} value={i}>
      {label(i)}
    </option>
  ))
  const same = from === to
  const diff = same ? null : diffReports(entries[from].report, entries[to].report)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-dim">
          {t('casefile.compareFrom')}{' '}
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className={SELECT}>
            {options}
          </select>
        </label>
        <span className="text-ink-dim">→</span>
        <label className="text-xs text-ink-dim">
          {t('casefile.compareTo')}{' '}
          <select value={to} onChange={(e) => setTo(Number(e.target.value))} className={SELECT}>
            {options}
          </select>
        </label>
      </div>

      {!diff && <p className="mt-3 text-xs text-ink-dim">{t('casefile.compareSame')}</p>}

      {diff && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandFrom)}`}>
              {t(`verdict.band.${diff.bandFrom}`)} ({diff.scoreFrom})
            </span>
            <span className="text-ink-dim">→</span>
            <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandTo)}`}>
              {t(`verdict.band.${diff.bandTo}`)} ({diff.scoreTo})
            </span>
            <span
              className={`px-2 py-1 rounded-lg ${diff.added.length ? 'bg-alert/10 text-alert' : 'bg-panel-2 text-ink-dim'}`}
            >
              {t('recheck.added', { count: diff.added.length })}
            </span>
            <span
              className={`px-2 py-1 rounded-lg ${diff.removed.length ? 'bg-amber/10 text-amber' : 'bg-panel-2 text-ink-dim'}`}
            >
              {t('recheck.removed', { count: diff.removed.length })}
            </span>
            <span className="px-2 py-1 rounded-lg bg-panel-2 text-ink-dim">
              {t('recheck.unchanged', { count: diff.unchanged })}
            </span>
          </div>
          {diff.added.length === 0 && diff.removed.length === 0 && (
            <p className="mt-3 text-xs text-ink-dim">{t('recheck.noChange')}</p>
          )}
          <div className="mt-3 space-y-3">
            {(
              [
                ['added', diff.added, 'text-alert', '+'],
                ['removed', diff.removed, 'text-amber', '−']
              ] as const
            ).map(
              ([key, list, tone, sign]) =>
                list.length > 0 && (
                  <div key={key}>
                    <p className={`text-[11px] font-semibold ${tone}`}>
                      {t(`recheck.${key}Title`)}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {list.map((f) => (
                        <li key={f.id} className="text-xs font-mono text-ink-dim break-all">
                          <span className={`${tone} mr-1`}>{sign}</span>
                          <span className="font-sans text-ink-dim/80 mr-1.5">
                            {featureName(t, f.scannerId, f.scannerId)}:
                          </span>
                          {f.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
            )}
          </div>
        </>
      )}
    </div>
  )
}
