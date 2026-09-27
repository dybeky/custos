import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScanStore } from '../../stores/scan-store'
import { bandChipClass } from '../../utils/report-view'
import { GAMES, type GameId } from '../../../shared/games'

/**
 * Every saved check, newest first, searchable by player. Opening one shows
 * it read-only in the results view; checks of the same player are what the
 * re-check comparison is built from.
 */
export function HistoryView({ onOpened }: { onOpened: () => void }) {
  const { t, i18n } = useTranslation()
  const { history, loadHistory, openHistory, deleteHistory, status } = useScanStore()
  const [query, setQuery] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? history.filter((h) => h.player.toLowerCase().includes(q) || h.id.includes(q)) : history
  }, [history, query])

  const open = async (id: string) => {
    if (await openHistory(id)) onOpened()
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink font-display">{t('history.title')}</h1>
            <p className="text-ink-dim mt-1 text-sm">{t('history.subtitle')}</p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('history.search')}
            className="h-9 w-64 max-w-full px-3 rounded-xl bg-panel border border-[color:var(--line)] text-sm text-ink placeholder:text-ink-dim/60 focus:outline-none focus:border-scan/50"
          />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-10 text-center text-sm text-ink-dim">
            {history.length === 0 ? t('history.empty') : t('history.noMatches')}
          </div>
        ) : (
          <div className="rounded-2xl border border-[color:var(--line)] bg-panel divide-y divide-[color:var(--line)] overflow-hidden">
            {rows.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2/60 transition-colors">
                <span className={`w-20 shrink-0 text-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${bandChipClass(h.band)}`}>
                  {t(`verdict.band.${h.band}`)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{h.player || <span className="text-ink-dim italic">{t('history.noPlayer')}</span>}</p>
                  <p className="text-xs text-ink-dim">
                    {fmt.format(new Date(h.scannedAt))}
                    {h.gameId && GAMES[h.gameId as GameId] ? ` · ${GAMES[h.gameId as GameId].name}` : ''}
                    {` · ${t('history.leads', { count: h.leads })}`}
                  </p>
                </div>
                {confirmId === h.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { void deleteHistory(h.id); setConfirmId(null) }} className="px-2.5 h-7 rounded-lg bg-alert/15 text-alert text-xs font-medium">{t('history.confirmDelete')}</button>
                    <button onClick={() => setConfirmId(null)} className="px-2.5 h-7 rounded-lg text-ink-dim text-xs hover:text-ink">{t('history.cancel')}</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => void open(h.id)}
                      disabled={status === 'scanning'}
                      className="px-3 h-8 rounded-lg bg-panel-2 text-ink text-xs font-medium hover:bg-scan/15 hover:text-scan disabled:opacity-40 transition-colors"
                    >
                      {t('history.open')}
                    </button>
                    <button onClick={() => setConfirmId(h.id)} className="px-2 h-8 rounded-lg text-ink-dim text-xs hover:text-alert" aria-label={t('history.delete')}>
                      {t('history.delete')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
