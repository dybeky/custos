import { describe, it, expect } from 'vitest'
import { sep } from 'path'
import { isWithin } from './path-safety'

const p = (...segs: string[]) => sep + segs.join(sep)

describe('isWithin', () => {
  it('treats the root itself as within', () => {
    expect(isWithin(p('scan'), p('scan'))).toBe(true)
  })
  it('accepts nested descendants', () => {
    expect(isWithin(p('scan'), p('scan', 'a', 'b'))).toBe(true)
  })
  it('rejects paths that escape the root (a junction pointing elsewhere)', () => {
    expect(isWithin(p('scan'), p('Windows', 'System32'))).toBe(false)
    expect(isWithin(p('scan'), sep)).toBe(false)
  })
  it('rejects sibling dirs that merely share a name prefix', () => {
    expect(isWithin(p('scan'), p('scan-evil'))).toBe(false)
  })
})
