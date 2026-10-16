/**
 * The launch music's volume rules, kept pure so they can be tested: a quiet
 * level, a slow fade in at the start of the track and a slow fade out before
 * its end, plus the fade the speaker button adds when music is switched off or
 * on in the middle of the track.
 */

/** How loud the music is at its fullest: 10% of the system volume. */
export const MUSIC_VOLUME = 0.1
/** Seconds of fade in at the start of the track. */
export const FADE_IN_S = 3
/** Seconds of fade out at the end of the track. */
export const FADE_OUT_S = 5
/** Seconds the speaker button takes to fade the music out or back in. */
export const TOGGLE_FADE_S = 0.7

const smooth = (x: number): number => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

/**
 * The volume envelope (0–1) at `position` seconds of a track that lasts
 * `duration` seconds. A track too short for both fades gets shorter fades
 * instead of a jump.
 */
export function envelopeAt(position: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const fadeIn = Math.min(FADE_IN_S, duration / 2)
  const fadeOut = Math.min(FADE_OUT_S, duration / 2)
  return Math.min(smooth(position / fadeIn), smooth((duration - position) / fadeOut))
}

/** Move `current` towards `target` (both 0–1) by at most `dtSec` worth of the toggle fade. */
export function stepToggleFade(current: number, target: number, dtSec: number): number {
  const step = Math.max(0, dtSec) / TOGGLE_FADE_S
  return target > current ? Math.min(target, current + step) : Math.max(target, current - step)
}

/** The volume to give the audio element: loudness × track envelope × button fade. */
export function musicVolume(position: number, duration: number, toggleFade: number): number {
  return Math.min(1, Math.max(0, MUSIC_VOLUME * envelopeAt(position, duration) * toggleFade))
}
