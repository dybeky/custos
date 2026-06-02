import { describe, it, expect } from 'vitest'
import { findPatternArgs } from './memory'

describe('findPatternArgs', () => {
  it('uses the 4-arg all-memory overload when module is empty', () => {
    expect(findPatternArgs(1, '', '48 8B', 0, 0)).toEqual([1, '48 8B', 0, 0])
  })
  it('uses the 5-arg by-module overload when module is named', () => {
    expect(findPatternArgs(1, 'game.exe', '48 8B', 0, 0)).toEqual([1, 'game.exe', '48 8B', 0, 0])
  })
})
