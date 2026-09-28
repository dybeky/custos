import { describe, it, expect } from 'vitest'
import { groupTimeline, type TimelineEntry } from './report-view'
import type { AnalyzedFinding } from '../../shared/types'

const MIN = 60_000
const entry = (id: string, scannerId: string, matched: string, at: number): TimelineEntry => ({
  finding: { id, scannerId, matched } as unknown as AnalyzedFinding,
  at,
  minutesBeforeScan: 0,
  recent: false
})

describe('groupTimeline', () => {
  it('folds a burst of the same scanner + signature into one row', () => {
    const groups = groupTimeline([
      entry('a', 'browser', 'ezmod.vip', 100 * MIN),
      entry('b', 'browser', 'EZMOD.VIP', 99 * MIN),
      entry('c', 'browser', 'ezmod.vip', 60 * MIN)
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].head.finding.id).toBe('a')
    expect(groups[0].rest.map((e) => e.finding.id)).toEqual(['b', 'c'])
  })

  it('starts a new row for another signature, another scanner, or after an hour', () => {
    const groups = groupTimeline([
      entry('a', 'browser', 'ezmod.vip', 300 * MIN),
      entry('b', 'browser', 'midnight', 299 * MIN),
      entry('c', 'prefetch', 'midnight', 298 * MIN),
      entry('d', 'prefetch', 'midnight', 200 * MIN)
    ])
    expect(groups.map((g) => g.head.finding.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('never folds entries that are not next to each other', () => {
    const groups = groupTimeline([
      entry('a', 'browser', 'x', 10 * MIN),
      entry('b', 'prefetch', 'y', 9 * MIN),
      entry('c', 'browser', 'x', 8 * MIN)
    ])
    expect(groups).toHaveLength(3)
  })
})
