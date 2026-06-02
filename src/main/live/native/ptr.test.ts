import { describe, it, expect } from 'vitest'
import { ptrInRange, formatPtr, toPtr } from './ptr'

describe('ptrInRange', () => {
  it('is end-exclusive and correct above 2^53', () => {
    const base = toPtr('0x7FF600000000')
    const size = toPtr(0x10000)
    expect(ptrInRange(base, base, size)).toBe(true)
    expect(ptrInRange(base + 0xffffn, base, size)).toBe(true)
    expect(ptrInRange(base + 0x10000n, base, size)).toBe(false)
    expect(ptrInRange(base - 1n, base, size)).toBe(false)
  })

  it('stays exact above 2^53 where doubles would round', () => {
    // 2^53 + 1 is the classic first integer doubles cannot represent exactly.
    const base = (1n << 53n) + 1n
    const size = 4n
    expect(ptrInRange(base, base, size)).toBe(true)
    expect(ptrInRange(base + 3n, base, size)).toBe(true)
    expect(ptrInRange(base + 4n, base, size)).toBe(false)
    // Sanity: as a Number, 2^53 and 2^53+1 collapse to the same value; bigint keeps them distinct.
    expect(Number(1n << 53n) === Number((1n << 53n) + 1n)).toBe(true)
    expect((1n << 53n) === (1n << 53n) + 1n).toBe(false)
  })
})

describe('formatPtr', () => {
  it('renders uppercase hex with 0x prefix', () => {
    expect(formatPtr(toPtr('0x1400abcde'))).toBe('0x1400ABCDE')
  })
})
