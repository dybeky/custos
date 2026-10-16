import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScanStore } from '../../stores/scan-store'
import { featureName } from '../../utils/feature-i18n'
import { bandChipClass } from '../../utils/report-view'
import { dateLocale } from '../../utils/date-locale'
import { uploaderLabel } from '../../utils/site-check'

/**
 * "This player was checked before": the site keeps every check under the player
 * (SteamID, else name), so a PC that has never run Custos still finds the history.
 * Shows the last check — when, by whom, the verdict then and now — and the
 * evidence that appeared or disappeared since. For staff who may view checks.
 */
export function SeenBeforeCard() {
  const { t, i18n } = useTranslation()
  const siteSeen = useScanStore((s) => s.siteSeen)
  const [open, setOpen] = useState(false)
  if (!siteSeen) return null

  const { previous, diff } = siteSeen
  const when = new Intl.DateTimeFormat(dateLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(previous.scannedAt))
  const changed = diff.added.length > 0 || diff.removed.length > 0

  return (
    <div className="rounded-2xl border border-amber/40 bg-panel p-5 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber">
            {t('seenBefore.title')}
          </p>
          <p className="mt-1 text-sm text-ink">
            {t('seenBefore.times', { count: previous.total })}
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {t('seenBefore.last', { when, who: uploaderLabel(t, previous.uploader) })}{' '}
            <button
              onClick={() => void window.electronAPI.openOnSite({ checkId: previous.id })}
              className="text-scan hover:underline"
            >
              {t('seenBefore.open')}
            </button>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandFrom)}`}>
            {t(`verdict.band.${diff.bandFrom}`)}
          </span>
          <span className="text-ink-dim">→</span>
          <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(diff.bandTo)}`}>
            {t(`verdict.band.${diff.bandTo}`)}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
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

      {!changed && <p className="mt-3 text-xs text-ink-dim">{t('recheck.noChange')}</p>}

      {changed && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-3 text-xs font-medium text-scan hover:underline"
          >
            {open ? t('recheck.hide') : t('recheck.show')}
          </button>
          {open && (
            <div className="mt-2 space-y-3">
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
          )}
        </>
      )}
    </div>
  )
}
