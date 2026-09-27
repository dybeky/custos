import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScanStore } from '../../stores/scan-store'
import { featureName } from '../../utils/feature-i18n'
import { bandChipClass } from '../../utils/report-view'

/**
 * "Compared to this player's previous check": verdict then vs now and the
 * evidence that appeared or disappeared since. Rendered only when the same
 * player (by SteamID, else name) was checked before.
 */
export function RecheckCard({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const { previous, openHistory } = useScanStore()
  const [open, setOpen] = useState(false)
  if (!previous) return null

  const { summary, diff } = previous
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(summary.scannedAt))
  const changed = diff.added.length > 0 || diff.removed.length > 0

  return (
    <div className={`rounded-2xl border border-[color:var(--line)] bg-panel ${compact ? 'p-4' : 'p-5 mb-6'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{t('recheck.title')}</p>
          <p className="mt-1 text-xs text-ink-dim">
            {t('recheck.previousOn', { when })}{' '}
            <button onClick={() => void openHistory(summary.id)} className="text-scan hover:underline">{t('recheck.open')}</button>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandFrom)}`}>{t(`verdict.band.${diff.bandFrom}`)}</span>
          <span className="text-ink-dim">→</span>
          <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandTo)}`}>{t(`verdict.band.${diff.bandTo}`)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`px-2 py-1 rounded-lg ${diff.added.length ? 'bg-alert/10 text-alert' : 'bg-panel-2 text-ink-dim'}`}>
          {t('recheck.added', { count: diff.added.length })}
        </span>
        <span className={`px-2 py-1 rounded-lg ${diff.removed.length ? 'bg-amber/10 text-amber' : 'bg-panel-2 text-ink-dim'}`}>
          {t('recheck.removed', { count: diff.removed.length })}
        </span>
        <span className="px-2 py-1 rounded-lg bg-panel-2 text-ink-dim">{t('recheck.unchanged', { count: diff.unchanged })}</span>
      </div>

      {!changed && <p className="mt-3 text-xs text-ink-dim">{t('recheck.noChange')}</p>}

      {changed && (
        <>
          <button onClick={() => setOpen((v) => !v)} className="mt-3 text-xs font-medium text-scan hover:underline">
            {open ? t('recheck.hide') : t('recheck.show')}
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              {([['added', diff.added, 'text-alert', '+'], ['removed', diff.removed, 'text-amber', '−']] as const).map(([key, list, tone, sign]) =>
                list.length > 0 && (
                  <div key={key}>
                    <p className={`text-[11px] font-semibold ${tone}`}>{t(`recheck.${key}Title`)}</p>
                    <ul className="mt-1 space-y-1">
                      {list.map((f) => (
                        <li key={f.id} className="text-xs font-mono text-ink-dim break-all">
                          <span className={`${tone} mr-1`}>{sign}</span>
                          <span className="font-sans text-ink-dim/80 mr-1.5">{featureName(t, f.scannerId, f.scannerId)}:</span>
                          {f.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
