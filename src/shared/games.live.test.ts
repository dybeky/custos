import { describe, it, expect } from 'vitest'
import { allowsLiveScan } from './games'

describe('allowsLiveScan', () => {
  it('allows Unturned only', () => {
    expect(allowsLiveScan('unturned')).toBe(true)
    expect(allowsLiveScan('cs2')).toBe(false)
    expect(allowsLiveScan('toString')).toBe(false)
    expect(allowsLiveScan('')).toBe(false)
  })
})
