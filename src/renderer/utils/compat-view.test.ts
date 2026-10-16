import { describe, expect, it } from 'vitest'
import type { CapabilityCategory, ScannerCapability } from '../../shared/types'
import { compatTone, groupCapabilities, unavailableReasons, visibleItems } from './compat-view'

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
