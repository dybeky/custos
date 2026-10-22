import { describe, it, expect } from 'vitest'
import { isIncompleteClean } from './report-view'
import type { ScanReport } from '../../shared/types'

const report = (band: string, failedCount: number): ScanReport =>
  ({
    verdict: { band },
    scanners: Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, success: i >= failedCount, durationMs: 1, count: 0 }))
  }) as unknown as ScanReport

describe('isIncompleteClean', () => {
  it('calls a finding-free result incomplete once three or more checks did not complete', () => {
    expect(isIncompleteClean(report('clean', 14))).toBe(true)
    expect(isIncompleteClean(report('clean', 3))).toBe(true)
  })

  it('keeps Clean when at most two checks failed, and never touches a result with findings', () => {
    expect(isIncompleteClean(report('clean', 2))).toBe(false)
    expect(isIncompleteClean(report('clean', 0))).toBe(false)
    expect(isIncompleteClean(report('high', 14))).toBe(false)
    expect(isIncompleteClean(null)).toBe(false)
  })
})
