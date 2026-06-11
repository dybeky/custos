import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '../components/ui/Card'

const ERROR_TOAST_MS = 6000

type ActionType = 'path' | 'registry' | 'external'

interface ManualItem {
  label: string
  hint?: string
  target: string
}

interface ManualCategory {
  id: string
  titleKey: string
  descKey?: string
  icon: React.ReactNode
  accent: string
  action: ActionType
  grid?: boolean
  showHint?: boolean
  items: ManualItem[]
}

/* ---- Icons (sized by parent via [&>svg] utilities) ---- */
const toolIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)
const folderIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)
const gameIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
)
const registryIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
)
const telegramIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
  </svg>
)
const globeIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
)
const chevron = (
  <svg className="w-4 h-4 shrink-0 text-ink-dim opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

export function Manual() {
  const { t } = useTranslation()
  const [registryError, setRegistryError] = useState(false)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(errorTimer.current), [])

  const categories: ManualCategory[] = [
    {
      id: 'systemTools',
      titleKey: 'manual.systemTools',
      icon: toolIcon,
      accent: '#FF678B',
      action: 'path',
      showHint: true,
      items: [
        { label: 'Data Usage', hint: 'ms-settings:datausage', target: 'ms-settings:datausage' },
        { label: 'Windows Defender', hint: 'windowsdefender:', target: 'windowsdefender:' }
      ]
    },
    {
      id: 'folders',
      titleKey: 'manual.folders',
      icon: folderIcon,
      accent: '#FFF48D',
      action: 'path',
      showHint: true,
      items: [
        { label: 'Videos', hint: '%USERPROFILE%\\Videos', target: '%USERPROFILE%\\Videos' },
        { label: 'Downloads', hint: '%USERPROFILE%\\Downloads', target: '%USERPROFILE%\\Downloads' },
        { label: 'AppData', hint: '%APPDATA%', target: '%APPDATA%' },
        { label: 'LocalAppData', hint: '%LOCALAPPDATA%', target: '%LOCALAPPDATA%' },
        { label: 'Prefetch', hint: 'C:\\Windows\\Prefetch', target: 'C:\\Windows\\Prefetch' },
        { label: 'OneDrive', hint: '%USERPROFILE%\\OneDrive', target: '%USERPROFILE%\\OneDrive' }
      ]
    },
    {
      id: 'games',
      titleKey: 'manual.games',
      icon: gameIcon,
      accent: '#FFF48D',
      action: 'path',
      showHint: true,
      items: [
        { label: 'Unturned', hint: 'Steam\\steamapps\\common\\Unturned', target: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Unturned' },
        { label: 'Steam', hint: 'C:\\Program Files (x86)\\Steam', target: 'C:\\Program Files (x86)\\Steam' }
      ]
    },
    {
      id: 'registry',
      titleKey: 'manual.registry',
      icon: registryIcon,
      accent: '#FF678B',
      action: 'registry',
      grid: true,
      items: [
        { label: 'MuiCache', target: 'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache' },
        { label: 'AppSwitched', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppSwitched' },
        { label: 'ShowJumpView', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\ShowJumpView' },
        { label: 'AppBadgeUpdated', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppBadgeUpdated' },
        { label: 'AppLaunch', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppLaunch' },
        { label: 'RunMRU', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU' },
        { label: 'UserAssist', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist' },
        { label: 'AppCompatFlags', target: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' },
        { label: 'Compatibility Assistant', target: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store' }
      ]
    },
    {
      id: 'telegram',
      titleKey: 'manual.telegramCheatBots',
      descKey: 'manual.telegramBotsDesc',
      icon: telegramIcon,
      accent: '#FFF48D',
      action: 'external',
      items: [
        { label: '@undeadsellerbot', target: 'https://t.me/undeadsellerbot' },
        { label: '@MelonySolutionBot', target: 'https://t.me/MelonySolutionBot' }
      ]
    },
    {
      id: 'resources',
      titleKey: 'manual.additionalResources',
      descKey: 'manual.additionalResourcesDesc',
      icon: globeIcon,
      accent: '#FFB3C6',
      action: 'external',
      showHint: true,
      items: [
        { label: 'Oplata.info', hint: 'oplata.info', target: 'https://oplata.info' },
        { label: 'FunPay.com', hint: 'funpay.com', target: 'https://funpay.com' }
      ]
    }
  ]

  const run = async (action: ActionType, target: string) => {
    clearTimeout(errorTimer.current)
    setRegistryError(false)
    if (action === 'path') window.electronAPI.openPath(target)
    else if (action === 'registry') {
      const result = await window.electronAPI.openRegistry(target)
      if (!result.success) {
        // Clear again here (not just at run() start): two rapid failures both
        // resolve after their run() guards ran, so the first timer would
        // otherwise survive and dismiss this toast early.
        clearTimeout(errorTimer.current)
        setRegistryError(true)
        errorTimer.current = setTimeout(() => setRegistryError(false), ERROR_TOAST_MS)
      }
    } else window.electronAPI.openExternal(target)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('manual.title')}</h1>
          <p className="text-ink-dim mt-1">{t('manual.subtitle')}</p>
        </div>

        <div className="columns-1 md:columns-2 xl:columns-3 gap-3">
          {categories.map((cat, i) => (
            <Card
              key={cat.id}
              padding="md"
              className="mb-3 break-inside-avoid"
              transition={{ duration: 0.25, delay: i * 0.05 }}
              style={{ '--accent': cat.accent } as React.CSSProperties}
            >
              {/* Card header */}
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px]"
                  style={{ background: `${cat.accent}1f`, color: cat.accent }}
                >
                  {cat.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-ink leading-tight font-display">{t(cat.titleKey)}</h3>
                  {cat.descKey && (
                    <p className="text-2xs text-ink-dim mt-0.5 truncate">{t(cat.descKey)}</p>
                  )}
                </div>
                <span
                  className="shrink-0 text-2xs font-mono px-2 py-0.5 rounded-full"
                  style={{ background: `${cat.accent}1a`, color: cat.accent }}
                >
                  {cat.items.length}
                </span>
              </div>

              {/* Items */}
              <div className={cat.grid ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'}>
                {cat.items.map((item) => (
                  <button
                    key={item.target}
                    onClick={() => run(cat.action, item.target)}
                    title={item.target}
                    className="group relative w-full flex items-center gap-3 pl-3.5 pr-2.5 py-2.5 rounded-xl bg-panel-2 hover:bg-panel-2 border border-[color:var(--line)] hover:border-[color:var(--line-strong)] transition-all duration-200 text-left overflow-hidden"
                  >
                    {/* Hover accent bar */}
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 rounded-full transition-all duration-200 group-hover:h-7"
                      style={{ background: 'var(--accent)' }}
                    />
                    {/* Icon chip */}
                    <span
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110 [&>svg]:w-[15px] [&>svg]:h-[15px]"
                      style={{ background: `${cat.accent}1f`, color: cat.accent }}
                    >
                      {cat.icon}
                    </span>
                    {/* Text */}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">{item.label}</span>
                      {cat.showHint && item.hint && (
                        <span className="block text-2xs text-ink-dim font-mono truncate mt-0.5">{item.hint}</span>
                      )}
                    </span>
                    {chevron}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Registry failure toast */}
      <AnimatePresence>
        {registryError && (
          <motion.div
            initial={{ opacity: 0, x: 40, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed bottom-4 right-4 z-[60] w-72 rounded-xl bg-panel border border-[color:var(--line-strong)] shadow-lg overflow-hidden"
          >
            <div className="p-3 flex items-start justify-between gap-2">
              <p className="text-xs text-ink-dim">{t('manual.registryKeyNotFound')}</p>
              <button onClick={() => setRegistryError(false)} aria-label={t('general.dismiss')} className="text-ink-dim hover:text-ink">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
