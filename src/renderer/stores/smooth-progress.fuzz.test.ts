import { describe, it, expect } from 'vitest'
import { stepProgress, realProgress, MAX_SPEED } from './smooth-progress'
import { envelopeAt, musicVolume, stepToggleFade, MUSIC_VOLUME } from '../utils/intro-music'
import { useScanStore } from './scan-store'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('smooth progress property tests', () => {
  it('is monotonic, bounded to 0-100 and never faster than MAX_SPEED', () => {
    const r = rng(31)
    for (let run = 0; run < 300; run++) {
      let value = 0
      let target = 0
      const slot = 100 / (1 + Math.floor(r() * 30))
      const finishing = r() < 0.3
      for (let i = 0; i < 400; i++) {
        if (r() < 0.05) target = Math.min(100, target + r() * 30)
        const dt = r() < 0.05 ? r() * 5 : r() * 0.05
        const next = stepProgress(value, { target, slot, finishing }, dt)
        expect(next).toBeGreaterThanOrEqual(value)
        expect(next).toBeLessThanOrEqual(100)
        expect(next - value).toBeLessThanOrEqual(MAX_SPEED * Math.min(dt, 0.25) + 1e-9)
        expect(Number.isFinite(next)).toBe(true)
        value = next
      }
    }
  })

  it('never creeps past the true target by more than the running slot, and reaches 100 when finishing', () => {
    let value = 0
    for (let i = 0; i < 2000; i++) value = stepProgress(value, { target: 40, slot: 10, finishing: false }, 0.016)
    expect(value).toBeLessThanOrEqual(40 + 10 * 0.85 + 1e-9)
    for (let i = 0; i < 2000; i++) value = stepProgress(value, { target: 100, slot: 0, finishing: true }, 0.016)
    expect(value).toBe(100)
  })

  it('a zero or negative frame time does not move the bar; a bad target does not poison it', () => {
    expect(stepProgress(50, { target: 80, slot: 5, finishing: false }, 0)).toBe(50)
    expect(stepProgress(50, { target: 80, slot: 5, finishing: false }, -3)).toBe(50)
    expect(Number.isFinite(stepProgress(10, { target: 50, slot: 5, finishing: false }, 0.1))).toBe(true)
  })

  it('the real progress stays finite whatever the scanner reports', () => {
    for (const percentage of [NaN, Infinity, -5, 500, undefined as unknown as number]) {
      const base = useScanStore.getState()
      const p = realProgress({
        ...base,
        scanners: [{ name: 'a' }, { name: 'b' }] as never,
        results: [],
        progress: { scannerName: 'a', percentage } as never
      })
      expect(Number.isFinite(p.target), String(percentage)).toBe(true)
      expect(p.target).toBeGreaterThanOrEqual(0)
      expect(p.target).toBeLessThanOrEqual(100)
    }
  })
})

describe('intro music property tests', () => {
  it('volume stays within 0..MUSIC_VOLUME for any position, duration and fade', () => {
    const r = rng(32)
    for (let i = 0; i < 20000; i++) {
      const duration = [NaN, Infinity, -1, 0, 0.5, 4, 30, 200][Math.floor(r() * 8)]
      const v = musicVolume((r() - 0.2) * 300, duration, r())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(MUSIC_VOLUME)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('the envelope rises at the start and falls at the end, with no jump', () => {
    const d = 60
    let prev = envelopeAt(0, d)
    expect(prev).toBe(0)
    for (let t = 0.05; t <= d; t += 0.05) {
      const v = envelopeAt(t, d)
      expect(Math.abs(v - prev)).toBeLessThan(0.05)
      prev = v
    }
    expect(envelopeAt(d, d)).toBe(0)
    expect(envelopeAt(30, d)).toBe(1)
  })

  it('the toggle fade is monotone towards its target and stays inside 0..1', () => {
    const r = rng(33)
    let fade = 1
    for (let i = 0; i < 2000; i++) {
      const target = r() < 0.5 ? 0 : 1
      const next = stepToggleFade(fade, target, r() * 0.2)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThanOrEqual(1)
      if (target > fade) expect(next).toBeGreaterThanOrEqual(fade)
      else expect(next).toBeLessThanOrEqual(fade)
      fade = next
    }
  })
})
