import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

describe('mapWithConcurrency', () => {
  it('preserves input order', async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms))
      return i
    })
    expect(out).toEqual([0, 1, 2])
  })

  it('never exceeds the concurrency limit', async () => {
    let active = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 1))
      active--
    })
    expect(peak).toBe(3)
  })

  it('still processes every item when given a non-positive limit', async () => {
    expect(await mapWithConcurrency([1, 2, 3], 0, async (n) => n * 2)).toEqual([2, 4, 6])
  })

  it('handles an empty input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })
})
