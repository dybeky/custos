import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../../stores/game-store'
import { useScanStore } from '../../stores/scan-store'
import { GAMES } from '../../../shared/games'
import { UserMenu } from '../../components/auth/UserMenu'
import { MODERN_NAV } from '../nav'
import { IconMinus, IconSearch, IconSettings, IconSquare, IconX } from '../icons'

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

/**
 * One quiet bar: wordmark + game, a segmented nav in the middle, and on the
 * right the command palette trigger, settings, account and window controls.
 */
export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { t } = useTranslation()
  const { selectedGame } = useGameStore()
  const scanning = useScanStore((s) => s.status === 'scanning')

  const win = 'w-9 h-8 flex items-center justify-center rounded-lg text-ink-dim hover:text-ink hover:bg-panel-2 transition-colors'

  return (
    // minmax(0,1fr) side columns: on a narrow window they shrink instead of
    // pushing the bar wider than the window (which clipped the wordmark).
    <header className="h-12 shrink-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 border-b border-[color:var(--line)] bg-bg/80 backdrop-blur-xl select-none whitespace-nowrap" style={drag}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[13px] font-semibold tracking-tight text-ink">custos</span>
        {selectedGame && (
          <span className="hidden sm:inline truncate px-1.5 py-0.5 rounded-md text-[10px] font-medium text-ink-dim border border-[color:var(--line)]">
            {GAMES[selectedGame].name}
          </span>
        )}
      </div>

      <nav className="flex items-center gap-0.5 p-0.5 rounded-xl bg-panel border border-[color:var(--line)]" style={noDrag} aria-label={t('modern.nav.label')}>
        {MODERN_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `relative px-2.5 lg:px-3.5 h-8 flex items-center gap-1.5 rounded-[10px] text-[13px] font-medium transition-colors ${
                isActive ? 'bg-panel-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]' : 'text-ink-dim hover:text-ink'
              }`
            }
          >
            {t(`modern.nav.${item.key}`)}
            {item.key === 'check' && scanning && <span className="w-1.5 h-1.5 rounded-full bg-scan m-pulse-dot" />}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-1 min-w-0" style={noDrag}>
        <button
          onClick={onOpenPalette}
          className="shrink-0 h-8 px-2 mr-1 flex items-center gap-2 rounded-lg border border-[color:var(--line)] text-ink-dim hover:text-ink hover:border-[color:var(--line-strong)] transition-colors"
          title={t('modern.palette.open')}
          aria-label={t('modern.palette.open')}
        >
          <IconSearch className="w-3.5 h-3.5" />
          <span className="text-xs hidden xl:inline">{t('modern.palette.short')}</span>
          <span className="m-kbd hidden md:inline-flex">Ctrl K</span>
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) => `${win} ${isActive ? 'text-ink bg-panel-2' : ''}`}
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
        >
          <IconSettings className="w-4 h-4" />
        </NavLink>
        <UserMenu />
        <div className="w-px h-5 bg-[color:var(--line)] mx-1" />
        <button className={win} onClick={() => window.electronAPI.minimize()} aria-label="Minimize"><IconMinus /></button>
        <button className={win} onClick={() => window.electronAPI.maximize()} aria-label="Maximize"><IconSquare className="w-3.5 h-3.5" /></button>
        <button className={`${win} hover:!text-alert hover:!bg-alert/10`} onClick={() => window.electronAPI.close()} aria-label="Close"><IconX /></button>
      </div>
    </header>
  )
}
