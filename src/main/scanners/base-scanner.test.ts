import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from '../utils/concurrency'

describe('mapWithConcurrency', () => {
  it('processes all items and preserves order', async () => {
    const out = await mapWithConcurrency([1,2,3,4], 2, async n => n * 2)
    expect(out).toEqual([2,4,6,8])
  })
  it('handles empty input', async () => {
    expect(await mapWithConcurrency([], 3, async n => n)).toEqual([])
  })
})
