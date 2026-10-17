import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ResultsTabs, type TabDef } from '../components/results/ResultsTabs'
import { InfoTip } from '../components/ui/InfoTip'
import { featureHelp } from '../utils/feature-i18n'
import { alpha } from '../utils/color'
import {
  UTILITIES,
  UTILITY_GROUPS,
  filterUtilities,
  siteHost,
  type UtilityDef,
  type UtilityGroup
} from '../utils/utilities-view'

type TabId = 'all' | UtilityGroup

const iconProps = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.5
} as const

const ICONS: Record<string, React.ReactNode> = {
  lastActivityView: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  usbDeview: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  everything: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  systemInformer: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  shellbagAnalyzer: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

const GROUP_ICON: Record<UtilityGroup, React.ReactNode> = {
  traces: (
    <svg {...iconProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  devices: ICONS.usbDeview,
  processes: ICONS.systemInformer
}

const GROUP_ACCENT: Record<UtilityGroup, string> = {
  traces: 'var(--scan-2)',
  devices: 'var(--scan)',
  processes: 'var(--scan-dim)'
}

const GROUP_KEY: Record<UtilityGroup, string> = {
  traces: 'Traces',
  devices: 'Devices',
  processes: 'Processes'
}

export function Utilities() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" jumps to the search box, like on the Manual page.
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

  const handleOpenUrl = (url: string) => {
    window.electronAPI.openExternal(url)
  }

  const textOf = (u: UtilityDef) =>
    `${t(u.descKey)} ${t(`utilities.whyText.${u.slug}`)} ${t(`utilities.howText.${u.slug}`)}`

  const shown = filterUtilities(tab, query, textOf)
  const sections = UTILITY_GROUPS.map((group) => ({ group, items: shown.filter((u) => u.group === group) })).filter(
    (s) => s.items.length > 0
  )

  const tabs: TabDef<TabId>[] = [
    { key: 'all', label: t('utilities.tabAll'), count: UTILITIES.length },
    ...UTILITY_GROUPS.map((group) => ({
      key: group as TabId,
      label: t(`utilities.tab${GROUP_KEY[group]}`),
      count: UTILITIES.filter((u) => u.group === group).length
    }))
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">{t('utilities.title')}</h1>
            <p className="mt-1 text-sm text-ink-dim">{t('utilities.subtitle')}</p>
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
              placeholder={t('utilities.search')}
              title={t('utilities.searchHint')}
              aria-label={t('utilities.search')}
              className="h-10 w-full rounded-xl border border-[color:var(--line)] bg-panel/60 pl-9 pr-9 text-sm text-ink placeholder:text-ink-dim/60 focus:border-scan/50 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-[color:var(--line)] px-1.5 text-[10px] text-ink-dim">/</kbd>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-scan/20 bg-scan/[0.05] px-4 py-3 text-xs text-ink-dim">
          <svg className="mt-px h-4 w-4 shrink-0 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{t('utilities.tip')}</span>
        </div>

        <ResultsTabs tabs={tabs} active={tab} onChange={setTab} />

        {sections.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-panel/40 p-10 text-center text-sm text-ink-dim">
            {t('utilities.noMatches')}
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map(({ group, items }, si) => {
              const accent = GROUP_ACCENT[group]
              return (
                <section key={group} style={{ '--accent': accent } as React.CSSProperties}>
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px]"
                      style={{ background: alpha(accent, 0.14), color: accent }}
                    >
                      {GROUP_ICON[group]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-base font-bold text-ink">{t(`utilities.group${GROUP_KEY[group]}`)}</h2>
                        <span className="rounded-md bg-ink/10 px-1.5 py-px text-[10px] font-bold text-ink-dim">{items.length}</span>
                      </div>
                      <p className="text-xs text-ink-dim">{t(`utilities.group${GROUP_KEY[group]}Desc`)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {items.map((u, i) => (
                      <motion.div
                        key={u.slug}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, delay: Math.min(si * 0.04 + i * 0.03, 0.4) }}
                        className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-panel/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent)] hover:bg-panel-2/70"
                      >
                        <span
                          className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
                          style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
                        />
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&>svg]:h-6 [&>svg]:w-6"
                            style={{ background: alpha(accent, 0.14), color: accent }}
                          >
                            {ICONS[u.slug]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="min-w-0 break-words font-display text-base font-semibold leading-snug text-ink">{u.name}</h3>
                              <InfoTip title={u.name} text={featureHelp(t, u.featureId)} />
                            </div>
                            <p className="truncate font-mono text-[10px] text-ink-dim/80" title={u.url}>{siteHost(u.url)}</p>
                          </div>
                        </div>

                        <p className="text-sm leading-relaxed text-ink-dim">{t(u.descKey)}</p>

                        <dl className="space-y-2 rounded-xl border border-[color:var(--line)] bg-panel-2/40 p-3 text-xs leading-relaxed">
                          <div>
                            <dt className="text-2xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
                              {t('utilities.whyLabel')}
                            </dt>
                            <dd className="mt-0.5 text-ink">{t(`utilities.whyText.${u.slug}`)}</dd>
                          </div>
                          <div>
                            <dt className="text-2xs font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
                              {t('utilities.howLabel')}
                            </dt>
                            <dd className="mt-0.5 text-ink-dim">{t(`utilities.howText.${u.slug}`)}</dd>
                          </div>
                        </dl>

                        <div className="mt-auto flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenUrl(u.url)}
                            title={`${u.name}\n${u.url}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition-colors hover:brightness-125 focus-visible:ring-1 focus-visible:ring-scan/50"
                            style={{ background: alpha(accent, 0.14), color: accent }}
                          >
                            {t('utilities.openWebsite')} ↗
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
