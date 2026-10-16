import { create } from 'zustand'
import { useScanStore } from './scan-store'

/**
 * The scan's progress as the screen shows it. The real progress arrives in
 * jumps (a scanner finishes, many finish at once, a fast scan is over in a
 * second), so the shown value glides instead: it chases the real one at a
 * limited speed, keeps creeping inside the scanner that is running so the bar
 * never freezes, and when the scan ends it fills up to 100 without a jump.
 */

/** The fastest the bar may move, in percent per second: 0 → 100 takes at least ~3 s. */
export const MAX_SPEED = 34
/** How strongly the bar chases a target that is ahead of it (per second). */
const CHASE = 2.4
/** Never slower than this while behind the target, so the last bit still arrives. */
const MIN_CHASE_SPEED = 3
/** Creep speed at the start of the running scanner's share of the bar; it slows towards the end of it. */
const CREEP_SPEED = 1.8
/** The creep never stops completely while the scanner is still running. */
const MIN_CREEP_SPEED = 0.12
/** The share of the running scanner's slot the creep may use up. */
const CREEP_SHARE = 0.85
/** Show the finished bar this long before the scanning view gives way. */
const HOLD_AT_END_MS = 350

export interface StepInput {
  /** The real progress (0–100), monotonic. */
  target: number
  /** How much of the bar one scanner is worth. */
  slot: number
  /** The scan is over: fill to 100. */
  finishing: boolean
}

/** Advance the shown value by `dtSec`. Pure; never goes backwards, never past what is true. */
export function stepProgress(value: number, input: StepInput, dtSec: number): number {
  const dt = Math.max(0, Math.min(dtSec, 0.25))
  if (input.finishing) {
    const speed = Math.min(MAX_SPEED, Math.max(MIN_CHASE_SPEED, (100 - value) * CHASE))
    return Math.min(100, value + speed * dt)
  }
  const target = Math.min(100, Math.max(0, input.target))
  if (value < target) {
    const speed = Math.min(MAX_SPEED, Math.max(MIN_CHASE_SPEED, (target - value) * CHASE))
    return Math.min(target, value + speed * dt)
  }
  // Caught up: keep moving a little, but stay inside the running scanner's slot.
  const room = input.slot * CREEP_SHARE
  const ceiling = Math.min(98.5, target + room)
  if (value >= ceiling) return value
  // Easing out: fast right after a scanner finishes, ever slower towards the
  // end of its slot, so a long last scanner never looks frozen or stuck at 99.
  const speed = Math.max(MIN_CREEP_SPEED, CREEP_SPEED * ((ceiling - value) / Math.max(room, 1)))
  return Math.min(ceiling, value + speed * dt)
}

/** The real progress from the scan store: finished scanners plus the running one's own part. */
export function realProgress(s: ReturnType<typeof useScanStore.getState>): { target: number; slot: number } {
  const n = s.scanners.length
  if (n === 0) return { target: 0, slot: 12 }
  const running = s.progress && !s.results.some((r) => r.scannerName === s.progress!.scannerName)
    ? Math.min(1, Math.max(0, s.progress.percentage / 100))
    : 0
  return { target: Math.min(100, ((s.results.length + running) / n) * 100), slot: 100 / n }
}

interface SmoothState {
  /** The value to draw, 0–100. */
  value: number
  /** Show the scanning view: a scan runs, or its bar is still filling up. */
  active: boolean
}

export const useSmoothProgress = create<SmoothState>(() => ({ value: 0, active: false }))

/**
 * Drive the shown progress from the scan store. Call once at the app root.
 * @returns an unsubscribe function.
 */
export function startSmoothProgress(): () => void {
  const set = useSmoothProgress.setState
  let raf = 0
  let last = 0
  let target = 0
  let finishing = false
  let holdUntil = 0

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const frame = (now: number): void => {
    raf = 0
    const dt = (now - last) / 1000
    last = now
    const s = useScanStore.getState()
    if (!finishing) {
      const real = realProgress(s)
      target = Math.max(target, real.target)
      const next = stepProgress(useSmoothProgress.getState().value, { target, slot: real.slot, finishing }, dt)
      set({ value: next })
    } else {
      const value = stepProgress(useSmoothProgress.getState().value, { target: 100, slot: 0, finishing }, dt)
      set({ value })
      if (value >= 100) {
        if (!holdUntil) holdUntil = now + HOLD_AT_END_MS
        if (now >= holdUntil) return set({ active: false })
      }
    }
    raf = requestAnimationFrame(frame)
  }

  const begin = (): void => {
    target = 0
    finishing = false
    holdUntil = 0
    last = performance.now()
    set({ value: 0, active: true })
    stop()
    raf = requestAnimationFrame(frame)
  }

  const unsub = useScanStore.subscribe((state, prev) => {
    if (state.status === prev.status) return
    if (state.status === 'scanning') begin()
    else if (state.status === 'completed' && useSmoothProgress.getState().active) finishing = true
    else {
      // Cancelled, failed, or a saved check opened: nothing to fill up.
      stop()
      set({ value: 0, active: false })
    }
  })
  if (useScanStore.getState().status === 'scanning') begin()

  return () => {
    unsub()
    stop()
  }
}
