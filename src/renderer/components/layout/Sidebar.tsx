import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useScanStore, shownFindingCount } from '../../stores/scan-store'
import { CustosMark } from '../ui/CustosMark'
import { playClick } from '../../utils/ui-sound'

type NavGroup = 'main' | 'review' | 'tools' | 'account'

interface NavItem {
  path: string
  icon: React.ReactNode
  labelKey: string
  group: NavGroup
}

const GROUPS: { id: NavGroup; labelKey: string }[] = [
  { id: 'main', labelKey: 'nav.groupMain' },
  { id: 'review', labelKey: 'nav.groupReview' },
  { id: 'tools', labelKey: 'nav.groupTools' },
  { id: 'account', labelKey: 'nav.groupAccount' }
]

const COLLAPSE_KEY = 'custos-sidebar-collapsed'
// Below this window width the menu folds to icons on its own.
const AUTO_COLLAPSE_PX = 960

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

const navItems: NavItem[] = [
  {
    path: '/',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    labelKey: 'nav.dashboard',
    group: 'main'
  },
  {
    path: '/scan',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    labelKey: 'nav.scan',
    group: 'main'
  },
  {
    path: '/live',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
      </svg>
    ),
    labelKey: 'nav.liveScan',
    group: 'main'
  },
  {
    path: '/results',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    labelKey: 'nav.results',
    group: 'review'
  },
  {
    path: '/history',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 2m6-2a9 9 0 11-3.2-6.9M21 4v4h-4" />
      </svg>
    ),
    labelKey: 'nav.history',
    group: 'review'
  },
  {
    path: '/manual',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15m.39 0a4.49 4.49 0 011.518.111" />
      </svg>
    ),
    labelKey: 'nav.manual',
    group: 'tools'
  },
  {
    path: '/utilities',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    labelKey: 'nav.utilities',
    group: 'tools'
  },
  {
    path: '/settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    labelKey: 'nav.settings',
    group: 'account'
  },
  {
    path: '/profile',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    labelKey: 'nav.profile',
    group: 'account'
  }
]

/** Ctrl+1…9 opens the n-th menu item. */
function useNavShortcuts(navigate: (path: string) => void, current: string): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > navItems.length) return
      const target = navItems[n - 1].path
      e.preventDefault()
      if (target === current) return
      playClick()
      navigate(target)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, current])
}

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status, results, scanners, _evidenceCount, _totalFindings } = useScanStore()
  const [pinnedCollapsed, setPinnedCollapsed] = useState(readCollapsed)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < AUTO_COLLAPSE_PX)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < AUTO_COLLAPSE_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useNavShortcuts(navigate, pathname)

  const collapsed = pinnedCollapsed || narrow
  const totalFindings = shownFindingCount({ _evidenceCount, _totalFindings })
  const scanning = status === 'scanning'
  const progress = scanning && scanners.length > 0 ? Math.min(100, (results.length / scanners.length) * 100) : 0

  const toggle = () => {
    const next = !pinnedCollapsed
    setPinnedCollapsed(next)
    playClick()
    try {
      globalThis.localStorage?.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // per-session only
    }
  }

  return (
    <motion.nav
      initial={false}
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="relative shrink-0 flex flex-col bg-panel/60 backdrop-blur-xl border-r border-[color:var(--line)] overflow-hidden select-none"
      aria-label={t('nav.menu')}
    >
      {/* Brand */}
      <div className="h-14 flex items-center gap-3 px-[18px] shrink-0">
        <div className="relative w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-panel-2 border border-[color:var(--line-strong)] shadow-[0_0_24px_-6px_rgba(var(--glow),.55)]">
          <CustosMark className="w-5 h-5" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="brand"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.18 }}
              className="min-w-0"
            >
              <div className="text-[15px] font-bold tracking-wide text-ink font-display leading-none">custos</div>
              <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-dim/70 leading-none">anti-cheat</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GROUPS.map((group, gi) => {
          const items = navItems.filter((i) => i.group === group.id)
          return (
            <div key={group.id} className={gi === 0 ? '' : 'mt-1.5'}>
              <div className="h-5 px-2.5 flex items-center">
                {collapsed ? (
                  gi > 0 && <span className="w-full h-px bg-[color:var(--line)]" />
                ) : (
                  <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-dim/60 whitespace-nowrap">
                    {t(group.labelKey)}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const index = navItems.indexOf(item) + 1
                  const label = t(item.labelKey)
                  const badge = item.path === '/results' && totalFindings > 0 ? totalFindings : null
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      aria-label={label}
                      title={`${label} (Ctrl+${index})`}
                      onClick={() => {
                        if (pathname !== item.path) playClick()
                      }}
                      className={({ isActive }) =>
                        `group relative flex items-center h-9 rounded-xl px-[13px] gap-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-scan/60 ${
                          isActive ? 'text-ink' : 'text-ink-dim hover:text-ink'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-0 rounded-xl bg-gradient-to-r from-scan/[0.14] to-scan/[0.02] border border-scan/25 shadow-[0_0_28px_-10px_rgba(var(--glow),.7)]"
                              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                            />
                          )}
                          {!isActive && (
                            <span className="absolute inset-0 rounded-xl bg-panel-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                          )}
                          {isActive && (
                            <motion.span
                              layoutId="nav-bar"
                              className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-scan shadow-[0_0_12px_rgba(var(--glow),.9)]"
                              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                            />
                          )}

                          <span className={`relative shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-scan' : ''}`}>
                            {item.icon}
                            {collapsed && badge !== null && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-alert text-bg text-2xs font-bold rounded-full flex items-center justify-center">
                                {badge > 9 ? '9+' : badge}
                              </span>
                            )}
                            {item.path === '/scan' && scanning && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5">
                                <span className="absolute inset-0 bg-scan rounded-full animate-ping opacity-75" />
                                <span className="absolute inset-0 bg-scan rounded-full" />
                              </span>
                            )}
                          </span>

                          {!collapsed && (
                            <>
                              <span className="relative flex-1 min-w-0 truncate text-[13px] font-medium">{label}</span>
                              {badge !== null && (
                                <span className="relative shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-alert/15 text-alert border border-alert/30 text-[10px] font-bold flex items-center justify-center">
                                  {badge > 99 ? '99+' : badge}
                                </span>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scan status */}
      {!collapsed && (
        <button
          onClick={() => {
            if (pathname !== '/scan') playClick()
            navigate('/scan')
          }}
          className="mx-2.5 mb-2 rounded-xl border border-[color:var(--line)] bg-panel-2/60 px-3 py-2.5 text-left [@media(max-height:660px)]:hidden hover:border-[color:var(--line-strong)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              {scanning && <span className="absolute inset-0 rounded-full bg-scan animate-ping opacity-70" />}
              <span className={`relative w-2 h-2 rounded-full ${scanning ? 'bg-scan' : totalFindings > 0 ? 'bg-alert' : 'bg-ok'}`} />
            </span>
            <span className="text-[11px] font-semibold text-ink whitespace-nowrap">
              {scanning ? t('nav.scanning') : status === 'completed' ? t('nav.lastScanDone') : t('nav.ready')}
            </span>
            {scanning && <span className="ml-auto text-[10px] font-mono text-ink-dim">{Math.round(progress)}%</span>}
          </div>
          <div className="mt-2 h-1 rounded-full bg-[color:var(--line)] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-scan to-scan-2"
              animate={{ width: scanning ? `${Math.max(4, progress)}%` : status === 'completed' ? '100%' : '0%' }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </button>
      )}

      {/* Collapse */}
      <button
        onClick={toggle}
        disabled={narrow}
        title={collapsed ? t('nav.expand') : t('nav.collapse')}
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        className="h-11 shrink-0 flex items-center gap-3 px-[22px] border-t border-[color:var(--line)] text-ink-dim hover:text-ink disabled:opacity-30 disabled:cursor-default transition-colors"
      >
        <motion.svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
          animate={{ rotate: collapsed ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
        </motion.svg>
        {!collapsed && <span className="text-[12px] whitespace-nowrap">{t('nav.collapse')}</span>}
      </button>
    </motion.nav>
  )
}
