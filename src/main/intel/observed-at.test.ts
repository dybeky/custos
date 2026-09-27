import { describe, it, expect } from 'vitest'
import { extractObservedAt } from './observed-at'

describe('extractObservedAt', () => {
  it('reads the UTC form used by the anti-forensics scanner', () => {
    expect(extractObservedAt('[Trace cleaning] CCleaner was run 2026-09-27 13:40 UTC (5 min ago)'))
      .toBe('2026-09-27T13:40:00.000Z')
  })

  it('reads the local en-GB form used by Prefetch / BAM / browser history', () => {
    const iso = extractObservedAt('C:\\Windows\\Prefetch\\UNDEAD.EXE-1A2B3C4D.pf | last run 27/09/2026, 12:30')
    expect(iso).toBe(new Date(2026, 8, 27, 12, 30).toISOString())
    expect(extractObservedAt('[BAM] C:\\x\\undead.exe | 01/02/2025, 09:05'))
      .toBe(new Date(2025, 1, 1, 9, 5).toISOString())
  })

  it('returns null when the finding has no time', () => {
    expect(extractObservedAt('C:\\Users\\p\\AppData\\Roaming\\undead')).toBeNull()
    expect(extractObservedAt('')).toBeNull()
  })

  it('rejects implausible dates', () => {
    expect(extractObservedAt('x | 01/01/1970, 00:00')).toBeNull()
  })
})
