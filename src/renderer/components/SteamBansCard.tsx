import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SteamBanInfo, SteamBansResult } from '../../shared/types'
import { useScanStore } from '../stores/scan-store'
import { steamIdentities } from '../utils/report-view'

const FAILED: SteamBansResult = { ok: false, exact: false, bans: [] }

/**
 * Bans of the Steam accounts found on the checked PC. Steam tells how many VAC
 * and game bans an account has and how long ago the last one was, never which
 * game it was for: that stays visible to the account's owner only. Informational:
 * it does not change the verdict (a ban can be old, or for another game).
 */
export function SteamBansCard() {
  const { t } = useTranslation()
  const report = useScanStore((s) => s.report)
  const accounts = useMemo(() => steamIdentities(report), [report])
  const key = accounts.map((a) => a.steamId).join(',')
  const [answer, setAnswer] = useState<{ key: string; result: SteamBansResult } | null>(null)

  useEffect(() => {
    if (!key) return
    let alive = true
    const ask = window.electronAPI?.getSteamBans
    if (typeof ask !== 'function') return
    ask(key.split(','))
      .then((result) => alive && setAnswer({ key, result }))
      .catch(() => alive && setAnswer({ key, result: FAILED }))
    return () => {
      alive = false
    }
  }, [key])

  if (accounts.length === 0) return null
  const result = answer?.key === key ? answer.result : null
  const byId = new Map<string, SteamBanInfo>((result?.bans ?? []).map((b) => [b.steamId, b]))
  const anyBan = (result?.bans ?? []).some((b) => b.vacBanned || (b.gameBans ?? 0) > 0)

  return (
    <div className={`rounded-2xl border bg-panel p-5 mb-6 ${anyBan ? 'border-alert/40' : 'border-[color:var(--line)]'}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${anyBan ? 'text-alert' : 'text-ink-dim'}`}>
        {t('steamBans.title')}
      </p>
      {!result ? (
        <p className="mt-2 text-xs text-ink-dim">{t('steamBans.checking')}</p>
      ) : !result.ok ? (
        <p className="mt-2 text-xs text-ink-dim">{t('steamBans.failed')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {accounts.map((a) => (
            <li key={a.steamId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 text-sm text-ink">
                {a.personaName ?? a.accountName}{' '}
                <span className="font-mono text-[10px] text-ink-dim">{a.steamId}</span>
              </span>
              <BanChips ban={byId.get(a.steamId)} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-ink-dim">
        {t('steamBans.hint')}
        {result?.ok && !result.exact ? ` ${t('steamBans.approx')}` : ''}
      </p>
    </div>
  )
}

function BanChips({ ban }: { ban: SteamBanInfo | undefined }) {
  const { t } = useTranslation()
  const chip = 'px-2 py-0.5 rounded-lg text-xs font-semibold'
  if (!ban) return <span className={`${chip} bg-panel-2 text-ink-dim`}>{t('steamBans.noData')}</span>
  const gameBans = ban.gameBans ?? 0
  const trade = ban.economyBan && ban.economyBan !== 'none'
  const clean = !ban.vacBanned && gameBans === 0 && !ban.communityBanned && !trade
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {ban.vacBanned && (
        <span className={`${chip} bg-alert/10 text-alert`}>
          {ban.vacBans ? t('steamBans.vac', { count: ban.vacBans }) : t('steamBans.vacBanned')}
        </span>
      )}
      {gameBans > 0 && <span className={`${chip} bg-alert/10 text-alert`}>{t('steamBans.game', { count: gameBans })}</span>}
      {ban.daysSinceLastBan !== null && (
        <span className={`${chip} bg-amber/10 text-amber`}>{t('steamBans.lastBan', { count: ban.daysSinceLastBan })}</span>
      )}
      {ban.communityBanned && <span className={`${chip} bg-amber/10 text-amber`}>{t('steamBans.community')}</span>}
      {trade && <span className={`${chip} bg-amber/10 text-amber`}>{t('steamBans.trade')}</span>}
      {clean && <span className={`${chip} bg-ok/10 text-ok`}>{t('steamBans.clean')}</span>}
    </span>
  )
}
