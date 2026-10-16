import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CREDITS } from '../../../shared/credits'
import { BootMark } from './BootMark'
import { BOOT_MIN_MS, BOOT_MIN_REDUCED_MS, BOOT_STEPS, bootFrame } from './boot-sequence'
import { useBootStore } from './boot-state'
import { shouldDropEffects } from './frame-budget'
import './boot.css'

const WORD = 'custos'
/** Time after which the status line admits startup is slower than usual. */
const SLOW_MS = 4000
/** Longest wait for the brand font before the intro starts anyway (it is a local file, normally a few ms). */
const FONT_WAIT_MS = 250
/** The exit animation (see boot.css) plus a little; the splash is removed after it, whatever happens. */
const EXIT_MS = 600
const EXIT_REDUCED_MS = 260

const prefersReducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Resolves once the window is actually on screen, so the intro is not played to an invisible window. */
function whenVisible(): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve()
  return new Promise((resolve) => {
    const on = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', on)
      resolve()
    }
    document.addEventListener('visibilitychange', on)
  })
}

function whenFontReady(): Promise<unknown> {
  const load = document.fonts?.load?.('700 1em MuseoModerno', 'custos')
  return Promise.race([
    (load ?? Promise.resolve()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS))
  ])
}

/**
 * The launch intro: the sword traces in, the wordmark rises letter by letter,
 * and a thin line fills as the real startup steps finish (see boot-sequence).
 * It leaves as soon as the app is ready and the minimum has passed, then the
 * two halves part on a bright seam. Plays over the app, which mounts behind it.
 */
function Intro({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const reduced = useRef(prefersReducedMotion()).current
  const [armed, setArmed] = useState(false)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [lite, setLite] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [ready, setReady] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [slow, setSlow] = useState(false)
  const fillRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)

  // Start the clock when the window is visible and the font is in, but never later than a failsafe.
  useEffect(() => {
    let cancelled = false
    const go = () => {
      if (!cancelled) setArmed(true)
    }
    void Promise.all([whenVisible(), whenFontReady()]).then(go, go)
    const failsafe = setTimeout(go, 1500)
    return () => {
      cancelled = true
      clearTimeout(failsafe)
    }
  }, [])

  useEffect(() => {
    if (!armed) return
    const minMs = reduced ? BOOT_MIN_REDUCED_MS : BOOT_MIN_MS
    const gaps: number[] = []
    let judged = reduced
    let start = -1
    let last = 0
    let lastPct = -1
    let raf = 0
    const trackWidth = () => trackRef.current?.offsetWidth ?? 0

    const tick = (now: number) => {
      if (start < 0) start = last = now
      const elapsed = now - start
      const frame = bootFrame({ elapsedMs: elapsed, done: useBootStore.getState().done, minMs })

      if (fillRef.current) fillRef.current.style.transform = `scaleX(${frame.progress.toFixed(4)})`
      if (headRef.current) headRef.current.style.transform = `translate3d(${(frame.progress * trackWidth()).toFixed(1)}px,0,0)`
      const pct = Math.floor(frame.progress * 100)
      if (pct !== lastPct && pctRef.current) {
        lastPct = pct
        pctRef.current.textContent = `${pct}%`
      }
      setRevealed(frame.revealed)
      setReady(frame.ready)
      setWaiting(frame.waiting)
      setSlow(elapsed >= SLOW_MS)

      if (!judged) {
        gaps.push(now - last)
        const drop = shouldDropEffects(gaps)
        if (drop !== null) {
          judged = true
          if (drop) setLite(true)
        }
      }
      last = now

      if (frame.finished) {
        setPhase('out')
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [armed, reduced])

  useEffect(() => {
    if (phase !== 'out') return
    const timer = setTimeout(onDone, reduced ? EXIT_REDUCED_MS : EXIT_MS)
    return () => clearTimeout(timer)
  }, [phase, reduced, onDone])

  const step = BOOT_STEPS[Math.max(0, revealed - 1)]
  const line = ready ? t('boot.ready') : slow ? t('boot.slow') : revealed > 0 ? t(`boot.${step}`) : ''

  return (
    <div
      className="boot"
      data-phase={phase}
      data-armed={armed || undefined}
      data-lite={lite || undefined}
      data-waiting={waiting || undefined}
      data-ready={ready || undefined}
      aria-hidden="true"
    >
      <div className="boot-shutter boot-shutter-top" />
      <div className="boot-shutter boot-shutter-bottom" />
      <div className="boot-seam" />

      <div className="boot-stage">
        <div className="boot-grid boot-fx" />
        <div className="boot-fx">
          <span className="boot-streak" />
          <span className="boot-streak" />
          <span className="boot-streak" />
        </div>
        <span className="boot-corner boot-corner-tl" />
        <span className="boot-corner boot-corner-tr" />
        <span className="boot-corner boot-corner-bl" />
        <span className="boot-corner boot-corner-br" />

        <div className="boot-center">
          <div className="boot-emblem">
            <div className="boot-glow boot-fx" />
            <div className="boot-ring boot-fx" />
            <div className="boot-ring boot-fx" />
            <BootMark />
          </div>
          <div className="boot-word">
            {WORD.split('').map((ch, i) => (
              <span key={i} className="boot-letter">
                <span className="boot-ch" style={{ '--i': i } as CSSProperties}>
                  {ch}
                </span>
              </span>
            ))}
          </div>
          <p className="boot-tag">{t('brand.tagline')}</p>
        </div>

        <div className="boot-hud">
          <div className="boot-row">
            <span className="boot-status">
              <span className="boot-prompt">&rsaquo;</span>
              <span key={line} className="boot-line">
                {line}
              </span>
            </span>
            <span ref={pctRef} className="boot-pct">
              0%
            </span>
          </div>
          <div ref={trackRef} className="boot-track">
            <div className="boot-ticks">
              {BOOT_STEPS.slice(1).map((id, i) => (
                <span key={id} className="boot-tick" style={{ left: `${((i + 1) / BOOT_STEPS.length) * 100}%` }} data-on={revealed > i + 1} />
              ))}
            </div>
            <div ref={fillRef} className="boot-fill-bar" />
            <div className="boot-wait" />
            <div ref={headRef} className="boot-head" />
          </div>
        </div>

        <p className="boot-credit">
          by <b>{CREDITS.author}</b>
        </p>
      </div>
    </div>
  )
}

/** A broken intro must never stop the app: on any error it just goes away. */
class SplashGuard extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFail()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function LaunchSplash({ onDone }: { onDone: () => void }) {
  return (
    <SplashGuard onFail={onDone}>
      <Intro onDone={onDone} />
    </SplashGuard>
  )
}
