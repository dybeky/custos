/**
 * Decides from the first frames of the intro whether this PC can afford the
 * optional effects (streaks, glow, grid). The essentials always play.
 */

/** Frame gaps (ms) to judge by; the first ones are skipped (mounting the app behind is one long frame). */
const SKIP = 2
const SAMPLES = 14
const SLOW_FRAME_MS = 34
const SLOW_SHARE = 0.35
const SLOW_MEDIAN_MS = 28

/** true: drop the effects, false: keep them, null: not enough frames yet. */
export function shouldDropEffects(gaps: readonly number[]): boolean | null {
  const judged = gaps.slice(SKIP, SKIP + SAMPLES)
  if (judged.length < SAMPLES) return null
  const slow = judged.filter((g) => g > SLOW_FRAME_MS).length
  const median = [...judged].sort((a, b) => a - b)[Math.floor(judged.length / 2)]
  return slow / judged.length >= SLOW_SHARE || median > SLOW_MEDIAN_MS
}
