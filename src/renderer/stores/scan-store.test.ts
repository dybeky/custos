import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStore } from './scan-store'
import type { ScanReport } from '../../shared/types'

const report: ScanReport = {
  id: 'scan-1',
  meta: { appVersion: '3.0.0', engineVersion: '1.0.0', scannedAt: '2026-06-19T00:00:00.000Z', durationMs: 10, gameId: null, signatureVersion: 'bundled-1' },
  verdict: { score: 25, band: 'low', rationale: 'An isolated keyword match', reasons: [] },
  findings: [],
  correlations: [],
  scanners: []
}

describe('scan store report', () => {
  beforeEach(() => useScanStore.getState().reset())

  it('starts with no report', () => {
    expect(useScanStore.getState().report).toBeNull()
  })

  it('stores a report', () => {
    useScanStore.getState().setReport(report)
    expect(useScanStore.getState().report?.verdict.band).toBe('low')
  })

  it('clears the report on reset', () => {
    useScanStore.getState().setReport(report)
    useScanStore.getState().reset()
    expect(useScanStore.getState().report).toBeNull()
  })
})
