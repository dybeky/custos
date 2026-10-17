import { describe, it, expect } from 'vitest'
import { parseRgbChannels, initialQuality, stepQuality, FALLBACK_ACCENT } from './ambient'

describe('ambient helpers', () => {
  it('parses channel triples', () => {
    expect(parseRgbChannels('200 255 46')).toEqual([200, 255, 46])
    expect(parseRgbChannels(' 1,2,3 ')).toEqual([1, 2, 3])
    expect(parseRgbChannels('300 0 0')).toEqual([255, 0, 0])
    expect(parseRgbChannels('')).toEqual(FALLBACK_ACCENT)
  })
  it('uses lower quality on weak CPUs', () => {
    expect(initialQuality(4)).toBe(0.6)
    expect(initialQuality(8)).toBe(1)
    expect(initialQuality(undefined)).toBe(1)
  })
  it('drops quality after many late frames, with a floor', () => {
    let s = { quality: 1, late: 0 }
    for (let i = 0; i < 91; i++) s = stepQuality(s.quality, s.late, 0.04)
    expect(s.quality).toBeCloseTo(0.6)
    expect(s.late).toBe(0)
    let q = 0.3
    for (let i = 0; i < 200; i++) q = stepQuality(q, 100, 0.04).quality
    expect(q).toBe(0.3)
  })
  it('recovers the late counter on fast frames', () => {
    expect(stepQuality(1, 5, 0.016)).toEqual({ quality: 1, late: 4 })
  })
})
