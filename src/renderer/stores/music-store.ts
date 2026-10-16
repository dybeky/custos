import { create } from 'zustand'
import introUrl from '../assets/intro.mp3'
import { musicVolume, stepToggleFade } from '../utils/intro-music'

/**
 * The launch music: it starts with the program, plays the track once, quietly,
 * with a slow fade in and fade out, and then nothing more happens. The speaker
 * button in the header fades it out or back in. Like everything else Custos
 * does, the choice is not kept on the PC: the next launch starts the music again.
 */

export type MusicStatus = 'idle' | 'playing' | 'ended'

interface MusicState {
  /** The speaker is on (the music is playing or will play). */
  enabled: boolean
  status: MusicStatus
}

export const useMusicStore = create<MusicState>(() => ({ enabled: true, status: 'idle' }))

const TICK_MS = 50

let audio: HTMLAudioElement | null = null
let timer: ReturnType<typeof setInterval> | null = null
let toggleFade = 1
let lastTick = 0

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function applyVolume(): void {
  if (!audio) return
  audio.volume = musicVolume(audio.currentTime, audio.duration, toggleFade)
}

function tick(): void {
  if (!audio) return
  const now = performance.now()
  const dt = (now - lastTick) / 1000
  lastTick = now
  const { enabled } = useMusicStore.getState()
  toggleFade = stepToggleFade(toggleFade, enabled ? 1 : 0, dt)
  applyVolume()
  // Faded out completely while switched off: pause until it is switched on.
  if (!enabled && toggleFade === 0) {
    audio.pause()
    stopTimer()
  }
}

function startTimer(): void {
  lastTick = performance.now()
  if (!timer) timer = setInterval(tick, TICK_MS)
}

/** Start (or resume) playing. Resolves false if the browser refused to play. */
async function play(): Promise<boolean> {
  if (!audio) return false
  applyVolume()
  try {
    await audio.play()
  } catch {
    return false
  }
  useMusicStore.setState({ status: 'playing' })
  startTimer()
  return true
}

/**
 * Start the launch music. Call once when the program starts. Never throws: no
 * sound device, a blocked autoplay or a missing file just leave it silent.
 *
 * @returns a function that stops the music and cleans up.
 */
export function startIntroMusic(): () => void {
  if (typeof Audio === 'undefined' || audio) return () => {}
  try {
    audio = new Audio(introUrl)
    audio.id = 'intro-music'
    audio.preload = 'auto'
    audio.loop = false
    audio.volume = 0
    audio.hidden = true
    document.body.appendChild(audio)
    toggleFade = useMusicStore.getState().enabled ? 1 : 0
    audio.addEventListener('ended', () => {
      stopTimer()
      useMusicStore.setState({ status: 'ended' })
    })
  } catch {
    audio = null
    return () => {}
  }

  let unlock: (() => void) | null = null
  if (useMusicStore.getState().enabled) {
    void play().then((ok) => {
      if (ok) return
      // Autoplay was refused: begin with the first click or key press instead.
      unlock = () => {
        window.removeEventListener('pointerdown', unlock!)
        window.removeEventListener('keydown', unlock!)
        unlock = null
        if (useMusicStore.getState().enabled && useMusicStore.getState().status === 'idle') void play()
      }
      window.addEventListener('pointerdown', unlock)
      window.addEventListener('keydown', unlock)
    })
  }

  return () => {
    stopTimer()
    if (unlock) {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    audio?.pause()
    audio?.remove()
    audio = null
    useMusicStore.setState({ status: 'idle' })
  }
}

/**
 * The speaker button: fade the music out, or bring it back. Once the track has
 * ended, a press plays it again from the start.
 */
export function toggleMusic(): void {
  const { enabled, status } = useMusicStore.getState()
  if (status === 'ended') {
    useMusicStore.setState({ enabled: true })
    if (audio) {
      audio.currentTime = 0
      toggleFade = 0
      void play()
    }
    return
  }
  useMusicStore.setState({ enabled: !enabled })
  if (!audio) return
  if (!enabled) void play()
  else if (status === 'playing') startTimer() // the timer carries the fade out, then pauses
}
