import { describe, it, expect } from 'vitest'
import { buildAobFinding, isScannablePattern } from './aob-detector'

describe('isScannablePattern', () => {
  it('accepts valid hex + wildcard patterns', () => {
    expect(isScannablePattern('48 8B ?? 00')).toBe(true)
  })
  it('rejects garbage patterns', () => {
    expect(isScannablePattern('zz zz')).toBe(false)
    expect(isScannablePattern('')).toBe(false)
  })
})

describe('buildAobFinding', () => {
  it('produces a high-confidence finding with name + address', () => {
    const f = buildAobFinding('undead-menu', 0x1400abcden)
    expect(f.confidence).toBe('high')
    expect(f.detectorId).toBe('aob')
    expect(f.detail).toContain('undead-menu')
    expect(f.detail.toUpperCase()).toContain('1400ABCDE')
  })
})
