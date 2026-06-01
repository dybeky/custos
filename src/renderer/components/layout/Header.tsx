import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppHealthStore } from '../../stores/app-health-store'

export function Header() {
  const { t } = useTranslation()
  const { status, osInfo, isLoaded, initialize } = useAppHealthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  const statusColors = {
    healthy: '#00BFA5',
    warning: '#FFB300',
    error: '#FF5252'
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
    <header className="h-10 flex items-center justify-between px-4 bg-panel border-b border-[color:var(--line)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Brand wordmark */}
      <div className="flex items-center">
        <span className="text-sm font-bold tracking-wide font-display text-scan text-glow">
          custos
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Status + Version indicator */}
        <div className="flex items-center gap-1.5 mr-2 h-full">
          {/* Status dot */}
          <div
            className="w-2 h-2 rounded-full animate-pulse-slow flex-shrink-0"
            style={{
              backgroundColor: statusColors[status],
              boxShadow: `0 0 8px ${statusColors[status]}80`
            }}
            title={statusTitles[status]}
          />

          {/* OS version */}
          {isLoaded && osInfo && (
            <span className="text-[11px] font-extrabold tracking-wide text-ink-dim font-display leading-none flex items-center">
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
