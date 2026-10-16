import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ResultsTabs, type TabDef } from '../components/results/ResultsTabs'
import { alpha } from '../utils/color'

const ERROR_TOAST_MS = 6000

import {
  MANUAL_ITEMS, itemSlug, shortRegistryKey,
  type ManualAction as ActionType, type ManualItemDef as ManualItem
} from '../../shared/manual-items'

interface ManualCategory {
  id: string
  titleKey: string
  descKey?: string
  /** i18n key of the long explanation shown in the category InfoTip. */
  helpKey: string
  icon: React.ReactNode
  accent: string
  action: ActionType
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
const traceIcon = (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const TAB_OF: Record<string, TabId> = {
  systemTools: 'system',
  folders: 'folders',
  traces: 'traces',
  games: 'games',
  registry: 'registry',
  telegram: 'links',
  resources: 'links'
}

type TabId = 'all' | 'system' | 'folders' | 'traces' | 'games' | 'registry' | 'links'

const DESCRIBED = new Set(['systemTools', 'folders', 'traces', 'games', 'registry'])

/** Which program a button opens its place in, for the little label on the card. */
function openerLabelKey(action: ActionType, target: string): string {
  if (action === 'registry') return 'manual.openRegedit'
  if (action === 'external') return 'manual.openBrowser'
  if (/^(ms-settings|windowsdefender):/i.test(target)) return 'manual.openSettings'
  return 'manual.openExplorer'
}

export function Manual() {
  const { t } = useTranslation()
  // i18n key of the failure toast, or false when hidden.
  const [registryError, setRegistryError] = useState<string | false>(false)
  const [tab, setTab] = useState<TabId>('all')
  const [query, setQuery] = useState('')
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => clearTimeout(errorTimer.current), [])

  // "/" jumps to the search box, like on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== '/' || e.ctrlKey || e.metaKey || el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const categories: ManualCategory[] = [
    {
      id: 'systemTools',
      titleKey: 'manual.systemTools',
      helpKey: 'help.manual.systemTools',
      icon: toolIcon,
      accent: 'var(--scan)',
      action: 'path',
      showHint: true,
      items: MANUAL_ITEMS.systemTools
    },
    {
      id: 'folders',
      titleKey: 'manual.folders',
      helpKey: 'help.manual.folders',
      icon: folderIcon,
      accent: 'var(--scan-dim)',
      action: 'path',
      showHint: true,
      items: MANUAL_ITEMS.folders
    },
    {
      id: 'traces',
      titleKey: 'manual.traces',
      helpKey: 'help.manual.traces',
      icon: traceIcon,
      accent: 'var(--scan-2)',
      action: 'path',
      showHint: true,
      items: MANUAL_ITEMS.traces
    },
    {
      id: 'games',
      titleKey: 'manual.games',
      helpKey: 'help.manual.games',
      icon: gameIcon,
      accent: 'var(--scan-dim)',
      action: 'steam',
      showHint: true,
      items: MANUAL_ITEMS.games
    },
    {
      id: 'registry',
      titleKey: 'manual.registry',
      helpKey: 'help.manual.registry',
      icon: registryIcon,
      accent: 'var(--scan)',
      action: 'registry',
      items: MANUAL_ITEMS.registry
    },
    {
      id: 'telegram',
      titleKey: 'manual.telegramCheatBots',
      descKey: 'manual.telegramBotsDesc',
      helpKey: 'help.manual.telegram',
      icon: telegramIcon,
      accent: 'var(--scan-dim)',
      action: 'external',
      items: MANUAL_ITEMS.telegram
    },
    {
      id: 'resources',
      titleKey: 'manual.additionalResources',
      descKey: 'manual.additionalResourcesDesc',
      helpKey: 'help.manual.resources',
      icon: globeIcon,
      accent: 'var(--scan-2)',
      action: 'external',
      showHint: true,
      items: MANUAL_ITEMS.resources
    }
  ]

  const run = async (action: ActionType, target: string) => {
    clearTimeout(errorTimer.current)
    setRegistryError(false)
    if (action === 'path') window.electronAPI.openPath(target)
    else if (action === 'steam') {
      if (!(await window.electronAPI.openSteamFolder(target))) {
        clearTimeout(errorTimer.current)
        setRegistryError('manual.steamFolderNotFound')
        errorTimer.current = setTimeout(() => setRegistryError(false), ERROR_TOAST_MS)
      }
    } else if (action === 'registry') {
      const result = await window.electronAPI.openRegistry(target)
      if (!result.success) {
        // Clear again here (not just at run() start): two rapid failures both
        // resolve after their run() guards ran, so the first timer would
        // otherwise survive and dismiss this toast early.
        clearTimeout(errorTimer.current)
        setRegistryError('manual.registryKeyNotFound')
        errorTimer.current = setTimeout(() => setRegistryError(false), ERROR_TOAST_MS)
      }
    } else window.electronAPI.openExternal(target)
  }

  const labelOf = (item: ManualItem) => (item.labelKey ? t(item.labelKey) : item.label)
  const descOf = (cat: ManualCategory, item: ManualItem) =>
    DESCRIBED.has(cat.id) ? t(`manual.desc.${cat.id}.${itemSlug(item.label)}`, { defaultValue: '' }) : ''

  const q = query.trim().toLowerCase()
  const sections = categories
    .filter((cat) => tab === 'all' || TAB_OF[cat.id] === tab)
    .map((cat) => ({
      cat,
      items: cat.items.filter(
        (item) =>
          !q ||
          `${labelOf(item)} ${item.label} ${descOf(cat, item)} ${item.hint ?? ''} ${item.target}`.toLowerCase().includes(q)
      )
    }))
    .filter((s) => s.items.length > 0)

  const countIn = (id: TabId) =>
    categories.filter((c) => id === 'all' || TAB_OF[c.id] === id).reduce((n, c) => n + c.items.length, 0)
  const tabs: TabDef<TabId>[] = (
    [
      ['all', 'manual.tabAll'],
      ['system', 'manual.tabSystem'],
      ['folders', 'manual.tabFolders'],
      ['traces', 'manual.tabTraces'],
      ['games', 'manual.tabGames'],
      ['registry', 'manual.tabRegistry'],
      ['links', 'manual.tabLinks']
    ] as Array<[TabId, string]>
  ).map(([key, label]) => ({ key, label: t(label), count: countIn(key) }))

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">{t('manual.title')}</h1>
            <p className="mt-1 text-sm text-ink-dim">{t('manual.subtitle')}</p>
          </div>
          <div className="relative w-full sm:w-80">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
              placeholder={t('manual.search')}
              title={t('manual.searchHint')}
              className="h-10 w-full rounded-xl border border-[color:var(--line)] bg-panel/60 pl-9 pr-9 text-sm text-ink placeholder:text-ink-dim/60 focus:border-scan/50 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[color:var(--line)] px-1.5 text-[10px] text-ink-dim">/</kbd>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-scan/20 bg-scan/[0.05] px-4 py-3 text-xs text-ink-dim">
          <svg className="mt-px h-4 w-4 shrink-0 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{t('manual.tip')}</span>
        </div>

        <ResultsTabs tabs={tabs} active={tab} onChange={setTab} />

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-panel/40 p-10 text-center text-sm text-ink-dim">
            {t('manual.noMatches')}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map(({ cat, items }, si) => (
              <section key={cat.id} style={{ '--accent': cat.accent } as React.CSSProperties}>
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px]"
                    style={{ background: alpha(cat.accent, 0.14), color: cat.accent }}
                  >
                    {cat.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-base font-bold text-ink">{t(cat.titleKey)}</h2>
                      <span className="rounded-md bg-ink/10 px-1.5 py-px text-[10px] font-bold text-ink-dim">{items.length}</span>
                    </div>
                    <p className="text-xs text-ink-dim">{cat.descKey ? t(cat.descKey) : t(cat.helpKey)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((item, i) => {
                    const action = item.action ?? cat.action
                    const desc = descOf(cat, item)
                    const hint = cat.id === 'registry' ? shortRegistryKey(item.target) : item.hint
                    return (
                      <motion.button
                        key={item.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: Math.min(si * 0.04 + i * 0.015, 0.4) }}
                        onClick={() => run(action, item.target)}
                        title={item.target && action !== 'steam' ? `${item.label}\n${item.target}` : item.label}
                        className="group relative flex min-h-[112px] flex-col gap-2 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-panel/50 p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent)] hover:bg-panel-2/70"
                      >
                        <span
                          className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                        />
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4"
                            style={{ background: alpha(cat.accent, 0.14), color: cat.accent }}
                          >
                            {cat.icon}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-ink">
                            {labelOf(item)}
                          </span>
                        </div>
                        {desc && <p className="line-clamp-3 text-xs leading-relaxed text-ink-dim">{desc}</p>}
                        <div className="mt-auto flex items-center gap-2 pt-1">
                          {(cat.showHint || cat.id === 'registry') && hint && (
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-dim/80">{hint}</span>
                          )}
                          <span
                            className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold opacity-80 transition-opacity group-hover:opacity-100"
                            style={{ background: alpha(cat.accent, 0.12), color: cat.accent }}
                          >
                            {t(openerLabelKey(action, item.target))} ↗
                          </span>
                        </div>
                      </motion.button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Registry failure toast */}
      <AnimatePresence>
        {registryError && (
          <motion.div
            initial={{ opacity: 0, x: 40, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed bottom-4 right-4 z-[60] w-72 overflow-hidden rounded-xl border border-[color:var(--line-strong)] bg-panel shadow-lg"
          >
            <div className="flex items-start justify-between gap-2 p-3">
              <p className="text-xs text-ink-dim">{registryError && t(registryError)}</p>
              <button onClick={() => setRegistryError(false)} aria-label={t('general.dismiss')} className="text-ink-dim hover:text-ink">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
