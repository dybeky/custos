import { describe, it, expect } from 'vitest'
import { stepProgress, realProgress, MAX_SPEED } from './smooth-progress'
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
    const violations: string[] = []
    for (let run = 0; run < 300; run++) {
      let value = 0
      let target = 0
      const slot = 100 / (1 + Math.floor(r() * 30))
      const finishing = r() < 0.3
      for (let i = 0; i < 400; i++) {
        if (r() < 0.05) target = Math.min(100, target + r() * 30)
        const dt = r() < 0.05 ? r() * 5 : r() * 0.05
        const next = stepProgress(value, { target, slot, finishing }, dt)
        // Plain comparisons: 120k steps with four expect() calls each time out on slow CI runners.
        if (!(next >= value && next <= 100 && next - value <= MAX_SPEED * Math.min(dt, 0.25) + 1e-9 && Number.isFinite(next))) {
          violations.push(`run ${run} step ${i}: ${value} -> ${next} (dt ${dt})`)
        }
        value = next
      }
    }
    expect(violations).toEqual([])
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
