import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { useAppHealthStore } from '../stores/app-health-store'
import { useGameStore } from '../stores/game-store'
import { GAMES } from '../../shared/games'
import type { CapabilityCategory, ScannerCapability, ChangelogGroup } from '../../shared/types'

// Accent color per changelog group — replaces emojis with quiet semantic color.
const CHANGELOG_ACCENT: Record<string, string> = {
  New: '#FF678B',          // scan blue
  Fixes: '#34D399',        // emerald — something resolved
  Performance: '#FFF48D',  // purple
  Improvements: '#FFF48D'  // steel blue
}
const CHANGELOG_ACCENT_DEFAULT = '#FF678B'

// Render order + i18n label key for each app-area group.
const CATEGORY_ORDER: { id: CapabilityCategory; labelKey: string }[] = [
  { id: 'scan', labelKey: 'dashboard.categoryScan' },
  { id: 'manual', labelKey: 'dashboard.categoryManual' },
  { id: 'utilities', labelKey: 'dashboard.categoryUtilities' },
  { id: 'export', labelKey: 'dashboard.categoryExport' }
]

export function Dashboard() {
  const { t } = useTranslation()
  const [appVersion, setAppVersion] = useState<string>('')
  const [changelog, setChangelog] = useState<ChangelogGroup[]>([])
  const [changelogLoaded, setChangelogLoaded] = useState(false)
  const { osInfo, capabilities, initialize } = useAppHealthStore()
  const { selectedGame } = useGameStore()

  useEffect(() => {
    loadVersion()
    initialize()
    window.electronAPI.getChangelog()
      .then((groups) => setChangelog(groups))
      .catch(() => setChangelog([]))
      .finally(() => setChangelogLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadVersion = async () => {
    try {
      const version = await window.electronAPI.getVersion()
      setAppVersion(version)
    } catch (error) {
      console.error('Failed to load version:', error)
      setAppVersion('?.?.?')
    }
  }

  const supported = capabilities.filter((c) => c.supported)
  const total = capabilities.length
  const ratio = total > 0 ? (supported.length / total) * 100 : 0
  const allReady = total > 0 && supported.length === total

  // Group capabilities by app area, preserving CATEGORY_ORDER and dropping
  // empty groups. Inside each group, supported checks come first.
  const groups = CATEGORY_ORDER.map(({ id, labelKey }) => {
    const items = capabilities
      .filter((c) => c.category === id)
      .sort((a, b) => Number(b.supported) - Number(a.supported))
    return { id, labelKey, items }
  }).filter((g) => g.items.length > 0)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        {/* Welcome Card — luminous hero */}
        <Card className="mb-4 relative overflow-hidden" transition={{ duration: 0.4 }}>
          {/* Gradient-mesh atmosphere */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-40 animate-blob-1"
              style={{ background: 'radial-gradient(circle, rgba(255,244,141,0.40), transparent 70%)' }}
            />
            <div
              className="absolute -bottom-24 -left-12 w-72 h-72 rounded-full blur-3xl opacity-30 animate-blob-2"
              style={{ background: 'radial-gradient(circle, rgba(255,103,139,0.35), transparent 70%)' }}
            />
          </div>

          <CardContent className="relative">
            <div className="flex items-center gap-4">
              {/* Emblem */}
              <div
                className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,244,141,0.15), rgba(255,103,139,0.15))',
                  boxShadow: '0 0 28px rgba(255,103,139,0.25)',
                  border: '1px solid rgba(255,103,139,0.2)'
                }}
              >
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                  <defs>
                    <linearGradient id="welcomeSword" x1="0" y1="0" x2="24" y2="24">
                      <stop offset="0%" stopColor="#FF678B" />
                      <stop offset="50%" stopColor="#FFF48D" />
                      <stop offset="100%" stopColor="#FF678B" />
                    </linearGradient>
                  </defs>
                  {/* Blade */}
                  <path
                    d="M12 2.5l1.6 3.4v7.3h-3.2V5.9L12 2.5z"
                    stroke="url(#welcomeSword)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  {/* Crossguard */}
                  <path
                    d="M7.4 14.2h9.2"
                    stroke="url(#welcomeSword)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  {/* Grip */}
                  <path
                    d="M12 14.2v4.2"
                    stroke="url(#welcomeSword)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  {/* Pommel */}
                  <circle cx="12" cy="20" r="1.4" stroke="url(#welcomeSword)" strokeWidth="1.6" />
                </svg>
              </div>

              {/* Heading */}
              <div className="min-w-0">
                <p className="text-2xs font-semibold tracking-[0.22em] text-ink-dim font-display">
                  {t('dashboard.eyebrow')}
                </p>
                <h1 className="text-3xl font-bold leading-tight text-scan text-glow inline-block font-display">
                  {t('dashboard.welcome')}
                </h1>
                <p className="text-sm text-ink-dim mt-0.5">
                  {t('dashboard.welcomeMessage')}
                </p>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Version Card — compact & fancy */}
        <Card className="relative overflow-hidden" transition={{ duration: 0.4, delay: 0.08 }}>
          <div
            className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, rgba(255,244,141,0.40), transparent 70%)' }}
          />
          <CardContent className="relative">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,103,139,0.15), rgba(255,244,141,0.15))',
                    boxShadow: '0 0 20px rgba(255,103,139,0.2)',
                    border: '1px solid rgba(255,103,139,0.2)'
                  }}
                >
                  <svg className="w-6 h-6 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xs font-semibold tracking-[0.22em] text-ink-dim font-display">
                    {t('dashboard.version')}
                  </p>
                  <p className="text-2xl font-bold leading-none mt-1 text-scan font-display inline-block">
                    {appVersion || '···'}
                  </p>
                </div>
              </div>

              <div
                className="relative shrink-0 inline-flex items-center gap-1.5 rounded-full bg-scan/10 px-2.5 py-1 overflow-hidden"
                style={{ animation: 'badgeBreathe 2.8s ease-in-out infinite' }}
              >
                {/* Light sweep gliding across the pill */}
                <span className="badge-sheen" aria-hidden="true" />
                {/* Dot with an expanding radar ring */}
                <span className="relative flex items-center justify-center w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-scan animate-status-ping" aria-hidden="true" />
                  <span
                    className="relative w-1.5 h-1.5 rounded-full bg-scan"
                    style={{ boxShadow: '0 0 8px rgba(255,103,139,0.6)' }}
                  />
                </span>
                <span className="relative text-2xs font-bold tracking-wide text-scan">
                  {t('dashboard.stable')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Changelog Card */}
        <Card className="mt-4">
          <CardContent>
            <h2 className="text-lg font-semibold text-ink font-display mb-3">{t('dashboard.changelog')}</h2>
            {changelogLoaded && changelog.length === 0 && (
              <p className="text-sm text-ink-dim">{t('dashboard.changelogEmpty')}</p>
            )}
            <div className="space-y-5">
              {changelog.map((group) => {
                const accent = CHANGELOG_ACCENT[group.group] ?? CHANGELOG_ACCENT_DEFAULT
                return (
                  <div key={group.group}>
                    {/* Group header: accent tab · name · count · hairline */}
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span
                        className="h-3.5 w-1 rounded-full shrink-0"
                        style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}66` }}
                      />
                      <h3
                        className="text-2xs font-bold tracking-[0.18em] uppercase font-display"
                        style={{ color: accent }}
                      >
                        {group.group}
                      </h3>
                      <span className="text-2xs font-semibold tabular-nums text-ink-dim/60">
                        {group.entries.length}
                      </span>
                      <span className="flex-1 h-px bg-[color:var(--line)]" />
                    </div>
                    <ul className="space-y-2 pl-3">
                      {group.entries.slice(0, 6).map((e) => (
                        <li key={e.sha} className="text-sm text-ink flex gap-2.5 items-start">
                          <span
                            className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                            style={{ backgroundColor: accent }}
                          />
                          <span className="leading-snug">{e.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Emulation notice — x64 build running on an ARM PC */}
        {osInfo?.isEmulated && (
          <Card className="mt-4 border-amber/30">
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-amber font-display">{t('dashboard.emulatedTitle')}</p>
                  <p className="text-xs text-ink-dim mt-0.5">{t('dashboard.emulatedDesc', { arch: osInfo.arch, appArch: osInfo.appArch })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Compatibility Card */}
        {total > 0 && (
          <Card className="mt-4">
            <CardContent>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink font-display">
                    {t('dashboard.compatibility')}
                  </h2>
                  <p className="text-xs text-ink-dim mt-0.5 truncate">
                    {allReady
                      ? t('dashboard.allChecksAvailable')
                      : t('dashboard.someChecksUnavailable')}
                    {' · '}{t('dashboard.autoDetected')}
                    {osInfo ? ` · ${osInfo.displayName}` : ''}
                    {selectedGame ? ` · ${GAMES[selectedGame].name}` : ''}
                  </p>
                </div>
                <div
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${
                    allReady ? 'bg-scan/10 text-scan' : 'bg-alert/10 text-alert'
                  }`}
                >
                  {supported.length}/{total}
                </div>
              </div>

              {/* Availability bar */}
              <div className="h-1.5 w-full rounded-full bg-panel-2 overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-scan transition-all duration-700 ease-out"
                  style={{ width: `${ratio}%` }}
                />
              </div>

              {/* Capability groups, one section per app area / tab */}
              <div className="space-y-4">
                {groups.map((group) => {
                  const groupReady = group.items.filter((c) => c.supported).length
                  return (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-2xs font-bold tracking-[0.18em] uppercase text-ink-dim font-display">
                          {t(group.labelKey)}
                        </h3>
                        <span className="text-2xs font-semibold tabular-nums text-ink-dim/70">
                          {groupReady}/{group.items.length}
                        </span>
                        <span className="flex-1 h-px bg-[color:var(--line)]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.map((cap) => (
                          <CapabilityChip key={cap.id} cap={cap} ready={cap.supported} t={t} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

interface CapabilityChipProps {
  cap: ScannerCapability
  ready: boolean
  t: (key: string) => string
}

function CapabilityChip({ cap, ready, t }: CapabilityChipProps) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
        ready
          ? 'border-scan/20 bg-scan/5'
          : 'border-[color:var(--line)] bg-panel-2/40'
      }`}
      title={ready ? cap.description : cap.reason || cap.description}
    >
      <div
        className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
          ready ? 'bg-scan/15 text-scan' : 'bg-ink-dim/10 text-ink-dim'
        }`}
      >
        {ready ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${ready ? 'text-ink' : 'text-ink-dim'}`}>
          {cap.name}
        </p>
        <p className="text-[11px] text-ink-dim truncate">
          {ready ? t('dashboard.ready') : cap.reason || t('dashboard.unavailable')}
        </p>
      </div>
    </div>
  )
}
