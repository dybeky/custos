import { describe, it, expect } from 'vitest'
import type { ScanReport } from '../../shared/types'
import { resultsFromReport, uploaderLabel } from './site-check'

const report = {
  id: 'r1',
  meta: { scannedAt: '2026-09-01T10:00:00.000Z' },
  findings: [
    { scannerId: 'steam', value: 'a' },
    { scannerId: 'steam', value: 'b' },
    { scannerId: 'prefetch', value: 'c' }
  ],
  scanners: [
    { id: 'steam', name: 'Steam', success: true, durationMs: 120, count: 2 },
    { id: 'prefetch', name: 'Prefetch', success: true, durationMs: 5, count: 1 },
    { id: 'browser', name: 'Browser', success: false, error: 'locked', partial: 'half', durationMs: 9, count: 0 }
  ]
} as unknown as ScanReport

describe('resultsFromReport', () => {
  it('groups the findings under their scanner and keeps its outcome', () => {
    const r = resultsFromReport(report)
    expect(r.map((x) => x.scannerName)).toEqual(['Steam', 'Prefetch', 'Browser'])
    expect(r[0]).toMatchObject({ findings: ['a', 'b'], hasFindings: true, success: true, duration: 120, count: 2 })
    expect(r[1].findings).toEqual(['c'])
    expect(r[2]).toMatchObject({ success: false, error: 'locked', partial: 'half', findings: [], hasFindings: false })
  })

  it('handles a report with no scanners', () => {
    expect(resultsFromReport({ ...report, scanners: [] } as unknown as ScanReport)).toEqual([])
  })
})

describe('uploaderLabel', () => {
  const t = ((k: string) => ({ 'site.noAccount': 'без аккаунта', 'site.appUploader': 'приложение' })[k] ?? k) as never

  it('translates the site\'s "no account" wording and keeps the checker\'s name', () => {
    expect(uploaderLabel(t, 'app · no account')).toBe('приложение · без аккаунта')
    expect(uploaderLabel(t, 'Alice · no account')).toBe('Alice · без аккаунта')
  })

  it('leaves a signed-in checker alone and dashes an unknown one', () => {
    expect(uploaderLabel(t, 'Alice')).toBe('Alice')
    expect(uploaderLabel(t, null)).toBe('—')
  })
})

describe('resultsFromReport: odd site data', () => {
  it('skips scanner and finding entries of the wrong shape instead of crashing', () => {
    const odd = {
      id: 'r',
      meta: { scannedAt: 'not a date' },
      findings: [null, 7, { scannerId: 's', value: 5 }, { scannerId: 's', value: 'ok' }],
      scanners: [1, null, 'x', { id: 's' }, { id: 's', name: 'S', success: true, durationMs: -3, count: 'many' }]
    } as unknown as ScanReport
    const r = resultsFromReport(odd)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ scannerName: 'S', findings: ['ok'], duration: 0, count: 0, hasFindings: true })
    expect(Number.isNaN(r[0].startTime.getTime())).toBe(false)
  })

  it('survives missing lists', () => {
    expect(resultsFromReport({ id: 'r' } as unknown as ScanReport)).toEqual([])
  })
})
