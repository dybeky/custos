import { describe, it, expect } from 'vitest'
import type { AnalyzedFinding, ScanReport } from '../../shared/types'
import {
  severityCounts, filterFindings, groupFindings, scannerState, bandTone, recentActivityCount, type EvidenceFilter
} from './results-view'

const f = (id: string, scannerId: string, severity: string, value = id, extra: Partial<AnalyzedFinding> = {}) =>
  ({ id, scannerId, severity, value, matched: null, category: 'file', ...extra }) as unknown as AnalyzedFinding

const report = (findings: AnalyzedFinding[]) =>
  ({ meta: { scannedAt: '2026-09-01T12:00:00.000Z' }, findings, scanners: [], correlations: [] }) as unknown as ScanReport

const ALL: EvidenceFilter = { severities: new Set(), query: '', showInfo: true, showSuppressed: false }

describe('results view helpers', () => {
  const r = report([
    f('1', 'steam', 'info', '[Steam Account] x'),
    f('2', 'prefetch', 'high', 'C:\\a\\undead.exe', { matched: 'undead' }),
    f('3', 'appdata', 'critical', 'C:\\b\\neverlose.dll', { matched: 'neverlose' }),
    f('4', 'appdata', 'low', 'C:\\c\\thing'),
    f('5', 'prefetch', 'medium', 'C:\\d\\other', { dismissed: true }),
    f('6', 'browser', 'high', 'https://cheat.example', { whitelisted: true })
  ])

  it('counts active findings per severity, leaving out dismissed and ignored ones', () => {
    expect(severityCounts(r)).toEqual({ critical: 1, high: 1, medium: 0, low: 1, info: 1 })
    expect(severityCounts(null)).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })
  })

  it('lists most severe first and hides suppressed findings by default', () => {
    expect(filterFindings(r, ALL).map((x) => x.id)).toEqual(['3', '2', '4', '1'])
    expect(filterFindings(r, { ...ALL, showSuppressed: true }).map((x) => x.id)).toEqual(['3', '2', '6', '5', '4', '1'])
  })

  it('hides informational context unless asked for it', () => {
    expect(filterFindings(r, { ...ALL, showInfo: false }).map((x) => x.id)).toEqual(['3', '2', '4'])
  })

  it('filters by severity and by text in the value, the match or the scanner', () => {
    expect(filterFindings(r, { ...ALL, severities: new Set(['high', 'critical']) }).map((x) => x.id)).toEqual(['3', '2'])
    expect(filterFindings(r, { ...ALL, query: 'NEVERLOSE' }).map((x) => x.id)).toEqual(['3'])
    expect(filterFindings(r, { ...ALL, query: 'undead' }).map((x) => x.id)).toEqual(['2'])
    expect(filterFindings(r, { ...ALL, query: 'prefetch' }).map((x) => x.id)).toEqual(['2'])
    expect(filterFindings(null, ALL)).toEqual([])
  })

  it('groups by severity, by scanner (worst first) or not at all', () => {
    const shown = filterFindings(r, ALL)
    expect(groupFindings(shown, 'severity').map((g) => g.key)).toEqual(['critical', 'high', 'low', 'info'])
    expect(groupFindings(shown, 'scanner').map((g) => g.key)).toEqual(['appdata', 'prefetch', 'steam'])
    expect(groupFindings(shown, 'flat')).toEqual([{ key: '', items: shown }])
    expect(groupFindings([], 'flat')).toEqual([])
  })

  it('tells what a scanner tile should say', () => {
    expect(scannerState({ success: false }, 0, 0)).toBe('failed')
    expect(scannerState({ success: true }, 2, 2)).toBe('hit')
    expect(scannerState({ success: true, partial: 'time limit' }, 0, 0)).toBe('partial')
    expect(scannerState({ success: true, partial: 'time limit' }, 1, 1)).toBe('hit')
    expect(scannerState({ success: true }, 0, 3)).toBe('info')
    expect(scannerState({ success: true }, 0, 0)).toBe('clean')
  })

  it('colours the bands: red for high and critical, amber for medium, accent otherwise', () => {
    expect(bandTone('critical').text).toBe('text-alert')
    expect(bandTone('high').stroke).toBe('stroke-alert')
    expect(bandTone('medium').text).toBe('text-amber')
    expect(bandTone('low').text).toBe('text-scan')
    expect(bandTone('clean').text).toBe('text-scan')
  })

  it('counts leads from the 24 hours before the scan, not informational events', () => {
    const rr = report([
      f('a', 'prefetch', 'high', 'x', { observedAt: '2026-09-01T10:00:00.000Z' }),
      f('b', 'prefetch', 'info', 'y', { observedAt: '2026-09-01T10:30:00.000Z' }),
      f('c', 'prefetch', 'high', 'z', { observedAt: '2026-08-20T10:00:00.000Z' })
    ])
    expect(recentActivityCount(rr)).toBe(1)
  })
})
