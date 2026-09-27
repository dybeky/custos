import { describe, it, expect } from 'vitest'
import type { AnalyzedFinding, ScanReport } from '../../shared/types'
import { bucketOf, filterCounts, groupFindings } from './findings-filter'
import { fuzzyMatch } from './commands'

const f = (id: string, over: Partial<AnalyzedFinding>): AnalyzedFinding => ({
  id, scannerId: 'appdata', value: `C:\\x\\${id}`, category: 'file', matched: null, severity: 'medium',
  baseSeverity: 'medium', confidence: 'low', baseConfidence: 'low', correlationId: null, reasons: [], ...over
})

const report = {
  findings: [
    f('a', { severity: 'high', matched: 'undead', scannerId: 'prefetch' }),
    f('b', { severity: 'medium', matched: 'melony' }),
    f('c', { severity: 'info', scannerId: 'steam', value: '[Steam Account] neo' }),
    f('d', { severity: 'high', dismissed: true }),
    f('e', { severity: 'critical', matched: 'undead', whitelisted: true })
  ]
} as unknown as ScanReport

describe('findings filter', () => {
  it('buckets findings into evidence / info / suppressed', () => {
    expect(report.findings.map(bucketOf)).toEqual(['evidence', 'evidence', 'info', 'suppressed', 'suppressed'])
    expect(filterCounts(report)).toEqual({ evidence: 2, info: 1, suppressed: 2, all: 5 })
  })

  it('groups a tab by severity, most serious first', () => {
    expect(groupFindings(report, 'evidence', '').map((g) => [g.severity, g.findings.map((x) => x.id)])).toEqual([
      ['high', ['a']], ['medium', ['b']]
    ])
    expect(groupFindings(report, 'all', '')[0].severity).toBe('critical')
  })

  it('searches value, signature and scanner id', () => {
    expect(groupFindings(report, 'all', 'UNDEAD').flatMap((g) => g.findings.map((x) => x.id))).toEqual(['e', 'a'])
    expect(groupFindings(report, 'all', 'steam').flatMap((g) => g.findings.map((x) => x.id))).toEqual(['c'])
    expect(groupFindings(report, 'evidence', 'nothing-matches')).toEqual([])
  })
})

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively, ignoring spaces', () => {
    expect(fuzzyMatch('exp tx', 'Export TXT')).toBe(true)
    expect(fuzzyMatch('нач пр', 'Начать проверку')).toBe(true)
    expect(fuzzyMatch('zzz', 'Export TXT')).toBe(false)
    expect(fuzzyMatch('', 'anything')).toBe(true)
  })
})
