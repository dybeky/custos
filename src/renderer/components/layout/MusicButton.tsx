import { useTranslation } from 'react-i18next'
import { toggleMusic, useMusicStore } from '../../stores/music-store'

/** The speaker in the header: music on (waves) or off (crossed out); after the track ends it offers to play it again. */
export function MusicButton() {
  const { t } = useTranslation()
  const enabled = useMusicStore((s) => s.enabled)
  const status = useMusicStore((s) => s.status)
  const on = enabled && status !== 'ended'
  const label = status === 'ended' ? t('music.replay') : enabled ? t('music.on') : t('music.off')

  return (
    <button
      onClick={toggleMusic}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`mr-1 flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-panel-2 active:opacity-70 ${
        on ? 'text-scan' : 'text-ink-dim hover:text-ink'
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 5L6 9H3v6h3l5 4V5z" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 010 7" className={status === 'playing' ? 'animate-pulse' : ''} />
            <path d="M18.5 5.5a9 9 0 010 13" className={status === 'playing' ? 'animate-pulse' : ''} style={{ animationDelay: '0.3s' }} />
          </>
        ) : (
          <path d="M22 9l-6 6M16 9l6 6" />
        )}
      </svg>
    </button>
  )
}
