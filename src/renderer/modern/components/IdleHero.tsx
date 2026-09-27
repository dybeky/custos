import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { useScanStore } from '../../stores/scan-store'
import { useGameStore } from '../../stores/game-store'
import { useAppHealthStore } from '../../stores/app-health-store'
import { GAMES } from '../../../shared/games'
import { IconPlay } from '../icons'

/**
 * The resting state: one big invitation to start, the player field (so the
 * report is labelled from the start), and a single line of readiness facts.
 */
export function IdleHero() {
  const { t } = useTranslation()
  const { startScan, caseInfo, setCaseInfo, error, status } = useScanStore()
  const { selectedGame } = useGameStore()
  const { osInfo, capabilities } = useAppHealthStore()
  const scanChecks = capabilities.filter((c) => c.category === 'scan')
  const ready = scanChecks.filter((c) => c.supported).length

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="flex flex-col items-center text-center"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-scan/80">{t('modern.check.eyebrow')}</p>
        <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-tight text-ink">{t('modern.check.title')}</h1>
        <p className="mt-2 max-w-md text-sm text-ink-dim">{t('modern.check.subtitle')}</p>

        <button
          onClick={() => void startScan(selectedGame ?? undefined)}
          className="group mt-10 w-36 h-36 rounded-full bg-scan text-on-accent flex flex-col items-center justify-center gap-1 m-breathe transition-transform hover:scale-[1.03] active:scale-95 focus-visible:ring-4 focus-visible:ring-scan/30"
          aria-keyshortcuts="Control+Enter"
        >
          <IconPlay className="w-7 h-7 translate-x-0.5" />
          <span className="text-sm font-semibold">{t('modern.check.start')}</span>
        </button>
        <p className="mt-4 text-xs text-ink-dim flex items-center gap-1.5">
          <span className="m-kbd">Ctrl</span><span className="m-kbd">Enter</span>
        </p>

        {status === 'error' && error && (
          <p className="mt-4 max-w-md text-xs text-alert break-words">{error}</p>
        )}

        <div className="mt-10 w-[min(420px,86vw)]">
          <label htmlFor="m-player" className="sr-only">{t('case.player')}</label>
          <input
            id="m-player"
            value={caseInfo.player}
            maxLength={200}
            onChange={(e) => setCaseInfo({ player: e.target.value })}
            placeholder={t('modern.check.playerPlaceholder')}
            className="w-full h-11 px-4 rounded-xl bg-panel border border-[color:var(--line)] text-sm text-ink text-center placeholder:text-ink-dim/60 focus:outline-none focus:border-scan/50"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-dim">
          {selectedGame && <span>{GAMES[selectedGame].name}</span>}
          {osInfo && <span>· {osInfo.displayName}</span>}
          {scanChecks.length > 0 && <span>· {t('modern.check.checksReady', { ready, total: scanChecks.length })}</span>}
        </div>
      </motion.div>
    </div>
  )
}
