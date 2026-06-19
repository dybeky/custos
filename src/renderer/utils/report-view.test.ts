import { describe, it, expect } from 'vitest'
import { buildSeverityLookup, severityKey } from './report-view'
import type { ScanReport } from '../../shared/types'

const report: ScanReport = {
  id: 'scan-1',
  meta: { appVersion: '3.0.0', engineVersion: '1.0.0', scannedAt: 'now', durationMs: 1, gameId: null, signatureVersion: 'bundled-1' },
  verdict: { score: 92, band: 'critical', rationale: 'x', reasons: [] },
  findings: [
    { id: 'a', scannerId: 'appdata', value: 'C:/undead.exe', category: 'file', matched: 'undead', severity: 'high', baseSeverity: 'medium', confidence: 'high', baseConfidence: 'low', correlationId: 'c1', reasons: [] }
  ],
  correlations: [],
  scanners: []
}

describe('report-view', () => {
  it('builds a (scannerId,value)→severity lookup', () => {
    const lookup = buildSeverityLookup(report)
    expect(lookup.get(severityKey('appdata', 'C:/undead.exe'))).toBe('high')
  })

  it('returns an empty lookup for a null report', () => {
    expect(buildSeverityLookup(null).size).toBe(0)
  })
})
