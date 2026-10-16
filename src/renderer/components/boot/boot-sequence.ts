/**
 * Timing and progress of the launch intro. Pure: the splash feeds it the clock
 * and which real startup steps are done, and draws what it returns.
 */

export const BOOT_STEPS = ['settings', 'signatures', 'scanners', 'system', 'account'] as const
export type BootStepId = (typeof BOOT_STEPS)[number]

/** Settings gate the app itself; every other step is shown but never holds the intro back for long. */
export const ESSENTIAL_STEP: BootStepId = 'settings'

/** Shortest the intro plays, so the animation reads as intentional (shorter with reduced motion). */
export const BOOT_MIN_MS = 1200
export const BOOT_MIN_REDUCED_MS = 700
/** After the minimum, optional steps that are still pending are waited for this long at most. */
export const BOOT_GRACE_MS = 500
/** Whatever happens, the intro is over by now. */
export const BOOT_MAX_MS = 8000

// A status line is shown at most every STEP_GAP_MS, so quick steps still read.
const STEP_FIRST_MS = 240
const STEP_GAP_MS = 175
/** While a step is really still running, the line creeps toward (never to) the next mark. */
const CREEP_MAX = 0.8
const CREEP_TAU_MS = 900

export interface BootInput {
  elapsedMs: number
  done: ReadonlySet<BootStepId>
  minMs?: number
}

export interface BootFrame {
  /** 0..1, never goes backwards as time passes and steps complete. */
  progress: number
  /** How many status lines have been shown (1 = the first step's line is up). */
  revealed: number
  /** Every step is done and shown: the status line reads "Ready". */
  ready: boolean
  /** The intro may leave now. */
  finished: boolean
  /** Past the minimum and still starting: the splash holds a calm waiting state. */
  waiting: boolean
}

const total = BOOT_STEPS.length

/** Steps done in order from the first one (a later step done early does not skip an earlier one). */
function contiguousDone(done: ReadonlySet<BootStepId>): number {
  let n = 0
  while (n < total && done.has(BOOT_STEPS[n])) n++
  return n
}

export function bootFrame({ elapsedMs, done, minMs = BOOT_MIN_MS }: BootInput): BootFrame {
  const essentialDone = done.has(ESSENTIAL_STEP)
  const allDone = done.size >= total
  const finished =
    elapsedMs >= BOOT_MAX_MS ||
    (elapsedMs >= minMs && essentialDone && (allDone || elapsedMs >= minMs + BOOT_GRACE_MS))

  if (finished) return { progress: 1, revealed: total, ready: true, finished: true, waiting: false }

  const byTime = elapsedMs < STEP_FIRST_MS ? 0 : Math.floor((elapsedMs - STEP_FIRST_MS) / STEP_GAP_MS) + 1
  // Line k shows while step k runs or has just finished; it never runs ahead of the real work.
  const completed = contiguousDone(done)
  const revealed = Math.min(byTime, completed + 1, total)
  if (revealed === 0) return { progress: 0, revealed: 0, ready: false, finished: false, waiting: false }

  // Steps before the shown line count fully; the shown one glides to its mark when it is
  // already done (held back only for pacing) and creeps slowly while it is really running.
  const sinceSlot = Math.max(0, elapsedMs - (STEP_FIRST_MS + (revealed - 1) * STEP_GAP_MS))
  const frac = completed >= revealed
    ? Math.min(0.95, sinceSlot / STEP_GAP_MS)
    : CREEP_MAX * (1 - Math.exp(-sinceSlot / CREEP_TAU_MS))
  const ready = completed >= total && elapsedMs >= STEP_FIRST_MS + total * STEP_GAP_MS
  const progress = ready ? 1 : Math.min(0.99, (revealed - 1 + frac) / total)

  return { progress, revealed, ready, finished: false, waiting: elapsedMs >= minMs }
}
