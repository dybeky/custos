import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SiteChecksPage } from '../../../shared/types'
import { GAMES, type GameId } from '../../../shared/games'
import { useScanStore } from '../../stores/scan-store'
import { bandChipClass } from '../../utils/report-view'
import { dateLocale } from '../../utils/date-locale'
import { uploaderLabel } from '../../utils/site-check'

const SEARCH_DELAY_MS = 350

/**
 * Every check on the site, by every checker: who checked whom, newest first.
 * Checks reach the site on their own when a scan finishes, so this is the
 * real history; opening one loads its full report from the site.
 */
export function SiteHistoryList({ query, onOpened }: { query: string; onOpened: () => void }) {
  const { t, i18n } = useTranslation()
  const status = useScanStore((s) => s.status)
  const openSiteCheck = useScanStore((s) => s.openSiteCheck)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<SiteChecksPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [openError, setOpenError] = useState('')
  const [reloads, setReloads] = useState(0)

  // A new search starts from the first page.
  useEffect(() => setPage(1), [query])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      window.electronAPI
        .getSiteChecks(page, query.trim())
        .catch((): SiteChecksPage => ({ ok: false, error: 'failed' }))
        .then((res) => {
          if (!alive) return
          setData(res)
          setLoading(false)
        })
    }, query ? SEARCH_DELAY_MS : 0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [page, query, reloads])

  const errorText = (code?: string) => t(`site.errors.${code ?? 'failed'}`, { defaultValue: t('site.errors.failed') })
  const fmt = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' })

  const open = async (id: string) => {
    setOpeningId(id)
    setOpenError('')
    const res = await openSiteCheck(id)
    setOpeningId(null)
    if (res.ok) onOpened()
    else setOpenError(errorText(res.error))
  }

  if (!data) {
    return <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-10 text-center text-sm text-ink-dim">{t('site.loading')}</div>
  }
  if (!data.ok) {
    return (
      <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-10 text-center text-sm text-ink-dim">
        <p>{errorText(data.error)}</p>
        <button onClick={() => setReloads((n) => n + 1)} className="mt-3 text-xs text-scan hover:underline">{t('history.retry')}</button>
      </div>
    )
  }

  const checks = data.checks ?? []
  const total = data.total ?? 0
  const pages = Math.max(1, Math.ceil(total / (data.pageSize || 50)))

  return (
    <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      {checks.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-10 text-center text-sm text-ink-dim">
          {query.trim() ? t('history.noMatches') : t('history.siteEmpty')}
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--line)] bg-panel divide-y divide-[color:var(--line)] overflow-hidden">
          {checks.map((c) => (
            <button
              key={c.id}
              onClick={() => void open(c.id)}
              disabled={status === 'scanning' || openingId !== null}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-panel-2/60 transition-colors disabled:opacity-60"
            >
              <span className={`w-20 shrink-0 text-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${bandChipClass(c.band)}`}>
                {t(`verdict.band.${c.band}`)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">
                  {c.player || <span className="text-ink-dim italic">{t('history.noPlayer')}</span>}
                </span>
                <span className="block text-xs text-ink-dim truncate">
                  {fmt.format(new Date(c.scannedAt))}
                  {c.gameId && GAMES[c.gameId as GameId] ? ` · ${GAMES[c.gameId as GameId].name}` : ''}
                  {` · ${t('history.leads', { count: c.leads })}`}
                  {` · ${t('history.checkedBy', { name: uploaderLabel(t, c.uploader) })}`}
                </span>
              </span>
              <span className="shrink-0 text-xs text-scan">{openingId === c.id ? t('site.loading') : t('history.open')}</span>
            </button>
          ))}
        </div>
      )}

      {openError && <p className="mt-3 text-xs text-alert">{openError}</p>}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-ink-dim">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="px-3 h-8 rounded-lg bg-panel-2 text-ink hover:text-scan disabled:opacity-40">
            {t('history.prev')}
          </button>
          <span>{t('history.pageOf', { page, pages })}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading} className="px-3 h-8 rounded-lg bg-panel-2 text-ink hover:text-scan disabled:opacity-40">
            {t('history.next')}
          </button>
        </div>
      )}
    </div>
  )
}
