import { describe, it, expect } from 'vitest'
import { compareSemver, isNewer } from './semver'

describe('compareSemver', () => {
  it('orders versions', () => {
    expect(compareSemver('3.1.0', '3.0.0')).toBe(1)
    expect(compareSemver('3.0.0', '3.1.0')).toBe(-1)
    expect(compareSemver('3.0.0', '3.0.0')).toBe(0)
  })
  it('ignores a leading v', () => {
    expect(compareSemver('v3.1.0', '3.0.9')).toBe(1)
  })
  it('compares patch + minor correctly', () => {
    expect(compareSemver('3.0.10', '3.0.2')).toBe(1)
    expect(compareSemver('3.2.0', '3.10.0')).toBe(-1)
  })
})

describe('isNewer', () => {
  it('is true only when the candidate is strictly greater', () => {
    expect(isNewer('3.1.0', '3.0.0')).toBe(true)
    expect(isNewer('3.0.0', '3.0.0')).toBe(false)
    expect(isNewer('2.9.9', '3.0.0')).toBe(false)
  })
})
