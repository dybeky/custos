import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Card, CardContent } from './ui/Card'
import { InfoTip } from './ui/InfoTip'
import { GAMES } from '../../shared/games'
import { featureName, featureDesc, featureHelp } from '../utils/feature-i18n'
import {
  PREVIEW_LIMIT,
  compatTone,
  groupCapabilities,
  readoutAvailable,
  readoutChecked,
  readoutDurationMs,
  readoutOrder,
  readoutProgress,
  readoutTimeMs,
  unavailableReasons,
  visibleItems,
  type CompatTone
} from '../utils/compat-view'
import type { CapabilityCategory, OsInfo, ScannerCapability } from '../../shared/types'

interface CompatibilityCardProps {
  osInfo: OsInfo | null
  capabilities: ScannerCapability[]
  /** Id of the game picked on the start screen, if any. */
  gameId: string | null
}

// Heroicons-style outline paths, one per app area.
const CATEGORY_ICON: Record<CapabilityCategory, string> = {
  scan: 'M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z',
  manual:
    'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
  utilities:
    'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
  export:
    'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3'
}

const ICON_OS =
  'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25'
const ICON_BUILD = 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5'
const ICON_ARCH =
  'M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z'
const ICON_GAME =
  'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z'
const ICON_WARN =
  'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z'

const TONE_TEXT: Record<CompatTone, string> = {
  ok: 'text-scan',
  partial: 'text-amber',
  none: 'text-alert'
}

function Icon({ path, className = 'w-3.5 h-3.5' }: { path: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d={path} />
    </svg>
  )
}

function Chip({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-panel-2/50 px-2.5 py-1 text-xs font-medium text-ink">
      <Icon path={icon} className="w-3.5 h-3.5 text-scan" />
      {children}
    </span>
  )
}

/** How long the last tile's own animation runs after it starts (see .readout-tile). */
const TILE_TAIL_MS = 520

interface ReadoutRefs {
  bar: RefObject<HTMLDivElement | null>
  ring: RefObject<SVGCircleElement | null>
  num: RefObject<HTMLSpanElement | null>
  text: RefObject<HTMLSpanElement | null>
}

/**
 * The read-out played each time the card appears. Nothing here re-renders the
 * card per frame: one requestAnimationFrame loop writes the scan line, the ring,
 * the counter and the percentage straight to their DOM nodes, and the tiles
 * animate themselves with CSS (transform and opacity, a delay each), so the
 * page keeps scrolling smoothly. React renders twice: at the start and when the
 * read-out ends. With reduced motion it starts finished.
 */
function useReadout(
  order: ScannerCapability[],
  supported: number,
  t: TFunction
): { playing: boolean; durationMs: number; refs: ReadoutRefs } {
  const reduced = useReducedMotion()
  const count = order.length
  const durationMs = readoutDurationMs(count)
  const [playing, setPlaying] = useState(() => !reduced && count > 0)
  const refs: ReadoutRefs = {
    bar: useRef<HTMLDivElement | null>(null),
    ring: useRef<SVGCircleElement | null>(null),
    num: useRef<HTMLSpanElement | null>(null),
    text: useRef<HTMLSpanElement | null>(null)
  }
  const live = useRef({ order, supported, t })
  live.current = { order, supported, t }
  useEffect(() => {
    if (count === 0) return
    if (reduced) {
      setPlaying(false)
      return
    }
    setPlaying(true)
    const start = performance.now()
    let raf = 0
    let timer = 0
    let lastChecked = -1
    let lastPercent = -1
    const frame = (now: number): void => {
      const { order: cur, supported: ok, t: tr } = live.current
      const p = readoutProgress(now - start, durationMs)
      const checked = readoutChecked(p, count)
      const percent = Math.floor(p * 100)
      refs.bar.current?.style.setProperty('transform', `scaleX(${p})`)
      refs.ring.current?.setAttribute('stroke-dasharray', `${(count > 0 ? ok / count : 0) * p} 1`)
      if (checked !== lastChecked && refs.num.current) {
        refs.num.current.textContent = String(readoutAvailable(cur, checked))
      }
      if ((checked !== lastChecked || percent !== lastPercent) && refs.text.current) {
        refs.text.current.textContent = tr('dashboard.readout', { done: checked, total: count, percent })
      }
      lastChecked = checked
      lastPercent = percent
      if (p < 1) raf = requestAnimationFrame(frame)
      else timer = window.setTimeout(() => setPlaying(false), TILE_TAIL_MS)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
    // refs are stable objects; live holds the latest data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, reduced, durationMs])
  return { playing: playing && !reduced, durationMs, refs }
}

/** Circular availability meter: arc length is the share of checks that can run. */
function CompatRing({
  supported,
  total,
  tone,
  playing,
  refs
}: {
  supported: number
  total: number
  tone: CompatTone
  playing: boolean
  refs: ReadoutRefs
}) {
  const ratio = total > 0 ? supported / total : 0
  return (
    <div className={`relative shrink-0 w-[84px] h-[84px] ${TONE_TEXT[tone]}`}>
      {/* The glow is a soft radial gradient on a round element: a filter on the svg would be cut into a square, and a blur filter is costly to paint. */}
      <span
        className="pointer-events-none absolute -inset-3 rounded-full opacity-[0.22]"
        style={{ background: 'radial-gradient(circle, currentColor 0%, transparent 68%)' }}
        aria-hidden
      />
      <svg viewBox="0 0 84 84" className="relative w-full h-full -rotate-90 overflow-visible" aria-hidden>
        <circle cx="42" cy="42" r="35" fill="none" strokeWidth="6" className="stroke-ink-dim/15" />
        {/* While reading, the read-out loop owns stroke-dasharray, frame by frame. */}
        <circle
          ref={refs.ring}
          cx="42"
          cy="42"
          r="35"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={playing ? '0 1' : `${ratio} 1`}
          style={{ opacity: ratio > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {playing ? (
          <span key="live" ref={refs.num} className="text-2xl font-bold tabular-nums font-display" />
        ) : (
          <span key="done" className="text-2xl font-bold tabular-nums font-display">
            {supported}
          </span>
        )}
        <span className="mt-1 text-2xs font-semibold tabular-nums text-ink-dim">/ {total}</span>
      </div>
    </div>
  )
}

const CapabilityTile = memo(function CapabilityTile({
  cap,
  delay
}: {
  cap: ScannerCapability
  /** ms after the read-out starts when this check is read; null once the read-out is over. */
  delay: number | null
}) {
  const { t } = useTranslation()
  const ready = cap.supported
  const name = featureName(t, cap.id, cap.name)
  const desc = featureDesc(t, cap.id, cap.description)
  const help = featureHelp(t, cap.id, cap.description)
  const reason = cap.reasonKey
    ? t(`capability.${cap.reasonKey}`, { ...cap.reasonParams, defaultValue: cap.reason ?? '' })
    : cap.reason

  const animated = delay !== null
  return (
    <div
      style={animated ? ({ '--d': `${Math.round(delay)}ms` } as CSSProperties) : undefined}
      className={`relative flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
        ready
          ? 'border-[color:var(--line)] bg-panel-2/30 hover:border-scan/30 hover:bg-panel-2/60'
          : 'border-amber/25 bg-amber/5'
      } ${animated ? (ready ? 'readout-tile' : 'readout-tile readout-tile-warn') : ''}`}
    >
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${ready ? 'bg-ok' : 'bg-amber'}`}
        style={{ boxShadow: `0 0 7px rgb(var(${ready ? '--ok-rgb' : '--amber-rgb'}) / 0.55)` }}
        title={ready ? t('dashboard.ready') : t('dashboard.unavailable')}
      >
        <span className="sr-only">{ready ? t('dashboard.ready') : t('dashboard.unavailable')}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium leading-tight line-clamp-2 ${ready ? 'text-ink' : 'text-ink-dim'}`}
        >
          {name}
        </p>
        {!ready && (
          <p className="text-[11px] leading-snug text-amber/90 line-clamp-2">
            {reason || t('dashboard.unavailable')}
          </p>
        )}
      </div>
      <InfoTip title={name} text={ready ? help : reason || help || desc} />
    </div>
  )
})

export function CompatibilityCard({ osInfo, capabilities, gameId }: CompatibilityCardProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})

  const total = capabilities.length
  const supported = capabilities.filter((c) => c.supported).length
  const tone = compatTone(supported, total)
  const groups = useMemo(() => groupCapabilities(capabilities), [capabilities])
  const reasons = useMemo(() => unavailableReasons(capabilities), [capabilities])
  const unavailable = total - supported

  // The read-out: checks are read in the order the groups show them.
  const order = useMemo(() => readoutOrder(groups), [groups])
  const { playing, durationMs, refs } = useReadout(order, supported, t)
  const delayOf = useMemo(() => {
    const m = new Map<string, number>()
    order.forEach((c, i) => m.set(c.id, readoutTimeMs(i, order.length, durationMs)))
    return m
  }, [order, durationMs])

  const osLabel = osInfo ? [osInfo.name, osInfo.edition].filter(Boolean).join(' ') : ''
  const arch = osInfo && osInfo.arch !== 'unknown' ? osInfo.arch.toUpperCase() : ''
  const game = gameId && gameId in GAMES ? GAMES[gameId as keyof typeof GAMES].name : ''

  const reasonText = (r: (typeof reasons)[number]) =>
    r.reasonKey
      ? t(`capability.${r.reasonKey}`, { ...r.reasonParams, defaultValue: r.reason })
      : r.reason

  return (
    <Card className="mt-4 relative overflow-hidden" transition={{ duration: 0.4, delay: 0.12 }}>
      <div
        className="pointer-events-none absolute -top-16 -left-10 w-56 h-56 rounded-full opacity-25"
        style={{
          background: `radial-gradient(circle, rgb(var(${
            tone === 'ok' ? '--scan-rgb' : '--amber-rgb'
          }) / 0.28), transparent 70%)`
        }}
      />
      {/* The scan line: a thin bar along the top edge that grows with the read-out. */}
      {playing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-scan/10" aria-hidden>
          <div
            ref={refs.bar}
            className="h-full origin-left bg-scan will-change-transform"
            style={{ transform: 'scaleX(0)', boxShadow: '0 0 10px rgb(var(--scan-rgb) / 0.8)' }}
          />
        </div>
      )}
      <CardContent className="relative">
        {/* Header: ring, title + verdict, system chips */}
        <div className="flex items-center gap-5">
          <CompatRing supported={supported} total={total} tone={tone} playing={playing} refs={refs} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-lg font-semibold text-ink font-display">
                {t('dashboard.compatibility')}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity duration-300 ${
                  tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-amber/10 text-amber'
                } ${playing ? 'opacity-0' : 'opacity-100'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${tone === 'ok' ? 'bg-ok' : 'bg-amber'}`} />
                {tone === 'ok' ? t('dashboard.allChecksAvailable') : t('dashboard.someChecksUnavailable')}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-dim" aria-live="off">
              {playing ? (
                <span ref={refs.text} className="tabular-nums text-scan" />
              ) : (
                <>
                  {t('dashboard.autoDetected')}
                  <span className="mx-1.5 text-ink-dim/40">·</span>
                  <span className="tabular-nums">
                    {supported} {t('dashboard.available')}
                  </span>
                </>
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {osLabel && <Chip icon={ICON_OS}>{osLabel}</Chip>}
              {osInfo && osInfo.build > 0 && (
                <Chip icon={ICON_BUILD}>{t('dashboard.chipBuild', { build: osInfo.build })}</Chip>
              )}
              {arch && <Chip icon={ICON_ARCH}>{arch}</Chip>}
              {game && <Chip icon={ICON_GAME}>{game}</Chip>}
            </div>
          </div>
        </div>

        {/* Why some checks can't run, and what to do about it */}
        {unavailable > 0 && (
          <div className="mt-5 rounded-xl border border-amber/25 bg-amber/5 p-3.5">
            <div className="flex items-center gap-2 text-amber">
              <Icon path={ICON_WARN} className="w-4 h-4" />
              <p className="text-sm font-semibold font-display">
                {t('dashboard.unavailableTitle')}
              </p>
              <span className="rounded-md bg-amber/15 px-1.5 py-px text-2xs font-bold tabular-nums">
                {unavailable}
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {reasons.map((r) => (
                <li key={`${r.reasonKey}|${r.reason}`} className="flex items-start gap-2 text-xs text-ink">
                  <span className="mt-0.5 shrink-0 rounded-md bg-amber/15 px-1.5 py-px text-2xs font-bold tabular-nums text-amber">
                    {r.count}
                  </span>
                  <span className="leading-snug">{reasonText(r)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-ink-dim">
              {[
                reasons.some((r) => r.reasonKey === 'platform') && t('dashboard.hintPlatform'),
                reasons.some((r) => r.reasonKey === 'build') && t('dashboard.hintBuild')
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          </div>
        )}

        {/* One section per app area / tab */}
        <div className="mt-5 space-y-4">
          {groups.map((group) => {
            const isCollapsed = !!collapsed[group.id]
            const expanded = !!showAll[group.id]
            const items = visibleItems(group.items, expanded)
            const hidden = group.items.length - items.length
            const canToggle = group.items.length > PREVIEW_LIMIT && (expanded || hidden > 0)
            const allReady = group.ready === group.items.length
            return (
              <section key={group.id}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsed((s) => ({ ...s, [group.id]: !s[group.id] }))}
                  className="group/head flex w-full items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-scan/50"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-scan/10 text-scan">
                    <Icon path={CATEGORY_ICON[group.id]} />
                  </span>
                  <h3 className="text-2xs font-bold tracking-[0.18em] uppercase text-ink font-display">
                    {t(group.labelKey)}
                  </h3>
                  <span
                    className={`rounded-md px-1.5 py-px text-2xs font-bold tabular-nums ${
                      allReady ? 'bg-scan/10 text-scan' : 'bg-amber/10 text-amber'
                    }`}
                  >
                    {group.ready}/{group.items.length}
                  </span>
                  <span className="flex-1 h-px bg-[color:var(--line)]" />
                  <svg
                    className={`w-4 h-4 shrink-0 text-ink-dim transition-transform duration-200 group-hover/head:text-scan ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="grid gap-2 pt-2.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                        {items.map((cap) => (
                          <CapabilityTile
                            key={cap.id}
                            cap={cap}
                            delay={playing ? (delayOf.get(cap.id) ?? 0) : null}
                          />
                        ))}
                      </div>
                      {canToggle && (
                        <button
                          type="button"
                          onClick={() => setShowAll((s) => ({ ...s, [group.id]: !s[group.id] }))}
                          className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-scan/25 bg-scan/5 px-3 py-1 text-xs font-semibold text-scan transition-colors hover:bg-scan/10 outline-none focus-visible:ring-1 focus-visible:ring-scan/50"
                        >
                          {expanded
                            ? t('dashboard.showLess')
                            : t('dashboard.showAll', { count: group.items.length })}
                          <svg
                            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
