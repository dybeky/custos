import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppHealthStore } from '../../stores/app-health-store'
import { useGameStore } from '../../stores/game-store'
import { GAMES } from '../../../shared/games'
import { UserMenu } from '../auth/UserMenu'

export function Header() {
  const { t } = useTranslation()
  const { status, osInfo, isLoaded, initialize } = useAppHealthStore()
  const { selectedGame } = useGameStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  const statusColors = {
    healthy: '#8FBF9F',
    warning: '#D9B380',
    error: '#D98E8E'
  }

  const statusTitles = {
    healthy: t('header.allSystemsOk'),
    warning: t('header.warningDetected'),
    error: t('header.errorDetected')
  }

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = () => window.electronAPI.maximize()
  const handleClose = () => window.electronAPI.close()

  return (
    <header className="h-10 flex items-center justify-between px-4 bg-panel/70 backdrop-blur-xl border-b border-[color:var(--line)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Brand wordmark */}
      <div className="flex items-center">
        <span className="text-sm font-bold tracking-wide font-display text-scan text-glow">
          custos
        </span>
        {selectedGame && (
          <span className="ml-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase text-ink-dim bg-panel-2 font-display">
            {GAMES[selectedGame].name}
          </span>
        )}
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Auth cluster — sign-in / avatar + dropdown (interactive: no-drag) */}
        <UserMenu />

        {/* Status + OS indicator — glass pill */}
        <div
          className="flex items-center gap-1.5 mr-2 h-6 px-2.5 rounded-full bg-panel-2/60 border border-[color:var(--line)] backdrop-blur-sm"
          title={statusTitles[status]}
        >
          {/* Status dot with expanding radar ring */}
          <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
            <span
              className="absolute inset-0 rounded-full animate-status-ping"
              style={{ backgroundColor: statusColors[status] }}
              aria-hidden="true"
            />
            <span
              className="relative w-2 h-2 rounded-full"
              style={{
                backgroundColor: statusColors[status],
                boxShadow: `0 0 8px ${statusColors[status]}aa`
              }}
            />
          </span>

          {/* OS version */}
          {isLoaded && osInfo && (
            <span className="text-[11px] font-extrabold tracking-wide text-ink-dim font-display leading-none">
              {osInfo.displayName}
            </span>
          )}
        </div>

        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-panel-2 active:opacity-70 transition-colors dock-icon"
        >
          <svg className="w-4 h-4 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-panel-2 active:opacity-70 transition-colors dock-icon"
        >
          <svg className="w-4 h-4 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-alert/20 active:bg-alert/30 transition-colors group dock-icon"
        >
          <svg className="w-4 h-4 text-ink-dim group-hover:text-alert transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>
  )
}
