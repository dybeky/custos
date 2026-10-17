import { describe, expect, it } from 'vitest'
import type { CapabilityCategory, ScannerCapability } from '../../shared/types'
import {
  compatTone, groupCapabilities, readoutAvailable, readoutChecked, readoutDurationMs, readoutOrder, readoutProgress, readoutState, readoutTimeMs,
  unavailableReasons, visibleItems
} from './compat-view'

function cap(
  id: string,
  category: CapabilityCategory,
  supported = true,
  extra: Partial<ScannerCapability> = {}
): ScannerCapability {
  return { id, name: id, description: '', supported, requirement: 'Windows', category, ...extra }
}

describe('groupCapabilities', () => {
  it('orders groups, drops empty ones and puts supported checks first', () => {
    const groups = groupCapabilities([
      cap('e1', 'export'),
      cap('s1', 'scan', false),
      cap('s2', 'scan'),
      cap('u1', 'utilities')
    ])
    expect(groups.map((g) => g.id)).toEqual(['scan', 'utilities', 'export'])
    expect(groups[0].items.map((c) => c.id)).toEqual(['s2', 's1'])
    expect(groups[0].ready).toBe(1)
  })
})

describe('visibleItems', () => {
  const items = Array.from({ length: 12 }, (_, i) => cap(`c${i}`, 'scan', i !== 11))

  it('shows everything for a short list or when expanded', () => {
    expect(visibleItems(items.slice(0, 5), false)).toHaveLength(5)
    expect(visibleItems(items, true)).toHaveLength(12)
  })

  it('previews the first checks but never hides an unavailable one', () => {
    const shown = visibleItems(items, false, 4)
    expect(shown.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c11'])
  })
})

describe('compatTone', () => {
  it('tells all, some and none apart', () => {
    expect(compatTone(31, 31)).toBe('ok')
    expect(compatTone(3, 31)).toBe('partial')
    expect(compatTone(0, 31)).toBe('none')
    expect(compatTone(0, 0)).toBe('none')
  })
})

describe('unavailableReasons', () => {
  it('merges equal reasons and counts them, most common first', () => {
    const platform = { reasonKey: 'platform' as const, reason: 'Not on macOS' }
    const build = { reasonKey: 'build' as const, reason: 'Needs build 16299+' }
    const out = unavailableReasons([
      cap('a', 'scan', false, build),
      cap('b', 'scan', false, platform),
      cap('c', 'manual', false, platform),
      cap('d', 'scan')
    ])
    expect(out.map((r) => [r.reasonKey, r.count])).toEqual([
      ['platform', 2],
      ['build', 1]
    ])
  })

  it('is empty when everything is available', () => {
    expect(unavailableReasons([cap('a', 'scan')])).toEqual([])
  })
})

describe('read-out timing', () => {
  it('lasts between 1.5 and 2.5 seconds and grows with the number of checks', () => {
    expect(readoutDurationMs(0)).toBe(1500)
    expect(readoutDurationMs(20)).toBeGreaterThan(1500)
    expect(readoutDurationMs(1000)).toBe(2500)
    for (let n = 1; n < 100; n++) expect(readoutDurationMs(n + 1)).toBeGreaterThanOrEqual(readoutDurationMs(n))
  })

  it('progress is monotonic, bounded and ends at exactly 1', () => {
    let prev = 0
    for (let t = 0; t <= 3000; t += 16) {
      const p = readoutProgress(t, 2000)
      expect(p).toBeGreaterThanOrEqual(prev)
      expect(p).toBeLessThanOrEqual(1)
      prev = p
    }
    expect(readoutProgress(0, 2000)).toBe(0)
    expect(readoutProgress(2000, 2000)).toBe(1)
    expect(readoutProgress(NaN, 2000)).toBe(1)
    expect(readoutProgress(-5, 2000)).toBe(0)
  })

  it('counts the checks read, one by one up to the total', () => {
    expect(readoutChecked(0, 40)).toBe(0)
    expect(readoutChecked(0.5, 40)).toBe(20)
    expect(readoutChecked(1, 40)).toBe(40)
    expect(readoutChecked(0.5, 0)).toBe(0)
    const seen = new Set<number>()
    for (let t = 0; t <= 2000; t += 8) seen.add(readoutChecked(readoutProgress(t, 2000), 41))
    expect(seen.size).toBe(42)
  })

  it('marks one check as being read and the rest as pending or checked', () => {
    expect([0, 1, 2, 3].map((i) => readoutState(i, 2, 4))).toEqual(['checked', 'checked', 'scanning', 'pending'])
    expect([0, 1].map((i) => readoutState(i, 2, 2))).toEqual(['checked', 'checked'])
  })

  it('counts only the real available checks among those read', () => {
    const groups = groupCapabilities([cap('a', 'scan'), cap('b', 'scan', false), cap('c', 'manual'), cap('d', 'export', false)])
    const order = readoutOrder(groups)
    expect(order.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(readoutAvailable(order, 0)).toBe(0)
    expect(readoutAvailable(order, 2)).toBe(1)
    expect(readoutAvailable(order, 99)).toBe(2)
  })
})

describe('readoutTimeMs', () => {
  it('is the inverse of the eased progress and monotonic', () => {
    const n = 31
    const d = readoutDurationMs(n)
    let prev = -1
    for (let i = 0; i < n; i++) {
      const t = readoutTimeMs(i, n, d)
      expect(t).toBeGreaterThanOrEqual(prev)
      expect(t).toBeLessThanOrEqual(d)
      expect(readoutChecked(readoutProgress(t + 0.5, d), n)).toBeGreaterThanOrEqual(i)
      prev = t
    }
    expect(readoutTimeMs(0, n, d)).toBe(0)
  })
})
