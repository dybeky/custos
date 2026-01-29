import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useAppHealthStore } from '../../stores/app-health-store'

export function Header() {
  const { effectsEnabled, toggleEffects } = useSettingsStore()
  const { status, windowsVersion, isLoaded, initialize } = useAppHealthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  const statusColors = {
    healthy: '#00BFA5',
    warning: '#FFB300',
    error: '#FF5252'
  }

  const statusTitles = {
    healthy: 'All systems OK',
    warning: 'Warning detected',
    error: 'Error detected'
  }

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = () => window.electronAPI.maximize()
  const handleClose = () => window.electronAPI.close()

  return (
    <header className="h-10 flex items-center justify-between px-4 bg-background/50 backdrop-blur-sm border-b border-border select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Logo text with gradient animation */}
      <div className="flex items-center">
        <span
          className="text-sm font-bold tracking-wide animate-gradient-text"
          style={{
            background: 'linear-gradient(90deg, #c6a2e8, #515ef5, #c6a2e8)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          custos
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Status + Version indicator */}
        <div className="flex items-center gap-1.5 mr-2" style={{ lineHeight: 1 }}>
          {/* Status dot with pulsation and glow */}
          <div
            className="w-2 h-2 rounded-full animate-pulse-slow flex-shrink-0"
            style={{
              backgroundColor: statusColors[status],
              boxShadow: `0 0 8px ${statusColors[status]}80`
            }}
            title={statusTitles[status]}
          />

          {/* Windows version with animated gradient */}
          {isLoaded && windowsVersion && (
            <span
              className="text-[11px] font-extrabold tracking-wide animate-gradient-text"
              style={{
                background: 'linear-gradient(90deg, #c6a2e8, #515ef5, #c6a2e8)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {windowsVersion.displayName}
            </span>
          )}
        </div>

        {/* Effects toggle button */}
        <button
          onClick={toggleEffects}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 active:bg-white/5 transition-colors"
          title={effectsEnabled ? 'Disable effects' : 'Enable effects'}
        >
          {effectsEnabled ? (
            <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>

        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 active:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 active:bg-white/5 transition-colors"
        >
          <svg className="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-error/20 active:bg-error/30 transition-colors group"
        >
          <svg className="w-4 h-4 text-text-secondary group-hover:text-error transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>
  )
}
