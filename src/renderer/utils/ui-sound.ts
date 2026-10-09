import clickUrl from '../assets/sounds/click.wav'

const SOUND_KEY = 'custos-ui-sound'
const VOLUME = 0.35
// Rapid clicks restart one sound instead of stacking a chorus of them.
const MIN_GAP_MS = 40

let audio: HTMLAudioElement | null = null
let lastPlay = 0

/** Whether menu sounds are on (per-PC preference, on by default). */
export function isUiSoundEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setUiSoundEnabled(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable — the choice lasts for this session only
  }
  if (on) playClick()
}

/** The menu click. Never throws: a missing audio device just stays silent. */
export function playClick(): void {
  if (typeof Audio === 'undefined' || !isUiSoundEnabled()) return
  const now = Date.now()
  if (now - lastPlay < MIN_GAP_MS) return
  lastPlay = now
  try {
    audio ??= Object.assign(new Audio(clickUrl), { volume: VOLUME, preload: 'auto' })
    audio.currentTime = 0
    void audio.play().catch(() => {})
  } catch {
    // no audio output
  }
}
