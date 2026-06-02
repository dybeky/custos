import { describe, it, expect } from 'vitest'
import { isSuspiciousRegion } from './injected-module-detector'
import { EXEC_PROTECTIONS, MEM_PRIVATE } from '../native/memory'

const PAGE_GUARD = 0x100
const PAGE_EXECUTE_READ = 0x20

describe('isSuspiciousRegion', () => {
  it('matches an exec protection even with PAGE_GUARD high bits set', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE_READ | PAGE_GUARD, EXEC_PROTECTIONS)).toBe(true)
  })
  it('ignores non-private regions', () => {
    expect(isSuspiciousRegion(0, PAGE_EXECUTE_READ, EXEC_PROTECTIONS)).toBe(false)
  })
})
