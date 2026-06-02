import { describe, it, expect } from 'vitest'
import { parseAobPattern } from './signatures'

describe('parseAobPattern', () => {
  it('parses valid two-char hex bytes and wildcards', () => {
    expect(parseAobPattern('48 8B ?? 00')).toEqual([0x48, 0x8b, null, 0x00])
  })
  it('rejects single-nibble and non-hex tokens', () => {
    expect(parseAobPattern('8Z')).toBeNull()
    expect(parseAobPattern('8')).toBeNull()
    expect(parseAobPattern('48 8')).toBeNull()
    expect(parseAobPattern('')).toBeNull()
  })
})
