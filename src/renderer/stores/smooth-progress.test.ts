import { describe, it, expect } from 'vitest'
import { stepProgress, realProgress, MAX_SPEED } from './smooth-progress'

/** Run the stepper for `seconds` at 60 fps. */
function run(value: number, input: Parameters<typeof stepProgress>[1], seconds: number): number {
  for (let i = 0; i < seconds * 60; i++) value = stepProgress(value, input, 1 / 60)
  return value
}

describe('stepProgress', () => {
  it('never jumps: a real jump from 0 to 93 is walked at a limited speed', () => {
    const oneSecond = run(0, { target: 93, slot: 5, finishing: false }, 1)
    expect(oneSecond).toBeLessThanOrEqual(MAX_SPEED + 0.5)
    expect(oneSecond).toBeGreaterThan(10)
    const settled = run(0, { target: 93, slot: 5, finishing: false }, 6)
    expect(settled).toBeGreaterThanOrEqual(93) // got there, then creeps inside the slot
    expect(settled).toBeLessThanOrEqual(93 + 5 * 0.85 + 0.001)
  })

  it('arrives at the target and does not pass it while chasing', () => {
    let v = 0
    for (let i = 0; i < 600; i++) {
      const next = stepProgress(v, { target: 40, slot: 0, finishing: false }, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(v)
      expect(next).toBeLessThanOrEqual(40)
      v = next
    }
    expect(v).toBe(40)
  })

  it('keeps creeping inside the running scanner, and stops short of the next one', () => {
    const slot = 10
    const afterAWhile = run(40, { target: 40, slot, finishing: false }, 30)
    expect(afterAWhile).toBeGreaterThan(40)
    expect(afterAWhile).toBeLessThanOrEqual(40 + slot * 0.85 + 0.001)
  })

  it('keeps moving, slowly, to the end of the running scanner’s slot', () => {
    const a = run(40, { target: 40, slot: 10, finishing: false }, 5)
    const b = run(a, { target: 40, slot: 10, finishing: false }, 5)
    expect(b).toBeGreaterThan(a)
    expect(b - a).toBeLessThan(a - 40)
  })

  it('never shows 100 while the scan is still running', () => {
    expect(run(98, { target: 100, slot: 50, finishing: false }, 20)).toBeLessThanOrEqual(100)
    expect(run(90, { target: 90, slot: 50, finishing: false }, 60)).toBeLessThanOrEqual(98.5)
  })

  it('fills up to 100 smoothly once the scan is over, even from zero', () => {
    const half = run(0, { target: 0, slot: 0, finishing: true }, 1)
    expect(half).toBeLessThan(40)
    expect(run(0, { target: 0, slot: 0, finishing: true }, 4)).toBe(100)
  })

  it('ignores a long frame (a stalled UI thread) instead of leaping', () => {
    expect(stepProgress(0, { target: 100, slot: 5, finishing: false }, 5)).toBeLessThanOrEqual(MAX_SPEED * 0.25 + 0.01)
  })

  it('never goes backwards when the target is behind the shown value', () => {
    expect(stepProgress(60, { target: 30, slot: 5, finishing: false }, 0.1)).toBeGreaterThanOrEqual(60)
  })
})

describe('realProgress', () => {
  const scanners = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, name: `S${i}` }))
  const state = (results: string[], progress: { scannerName: string; percentage: number } | null, n = 4) =>
    ({
      scanners: scanners.slice(0, n),
      results: results.map((scannerName) => ({ scannerName })),
      progress
    }) as unknown as Parameters<typeof realProgress>[0]

  it('counts finished scanners plus the running one’s own part', () => {
    expect(realProgress(state(['S0'], { scannerName: 'S1', percentage: 50 }))).toEqual({ target: 37.5, slot: 25 })
  })

  it('does not count a scanner twice once its result is in', () => {
    expect(realProgress(state(['S0', 'S1'], { scannerName: 'S1', percentage: 100 })).target).toBe(50)
  })

  it('has a small creep room before the scanner list is known', () => {
    expect(realProgress(state([], null, 0))).toEqual({ target: 0, slot: 12 })
  })
})
