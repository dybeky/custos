import { describe, it, expect } from 'vitest'
import { classifyFindings, correlate, computeVerdict } from './risk-engine'
import type { ScanResult } from '../../shared/types'

function result(scannerName: string, findings: string[], success = true): ScanResult {
  const now = new Date(0)
  return { scannerName, success, findings, startTime: now, endTime: now, duration: 1, count: findings.length, hasFindings: findings.length > 0 }
}

// keyword matcher stub: a finding "matches" a signature if it contains it (case-insensitive)
const SIGS = ['undead', 'aimbot']
const findKeyword = (v: string): string | null =>
  SIGS.find(s => v.toLowerCase().includes(s)) ?? null

describe('classifyFindings', () => {
  it('classifies a lone keyword file match as medium severity / LOW confidence', () => {
    const out = classifyFindings([result('AppData Scanner', ['C:/x/undead.exe'])], findKeyword)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      scannerId: 'appdata', category: 'file', matched: 'undead',
      baseSeverity: 'medium', severity: 'medium',
      baseConfidence: 'low', confidence: 'low'
    })
    expect(out[0].id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('treats a file-hash finding as a verified hash: critical severity, high confidence', () => {
    const out = classifyFindings([result('File Hash Scanner', ['deadbeef  C:/d/cheat.exe'])], findKeyword)
    expect(out[0]).toMatchObject({
      scannerId: 'filehash', category: 'hash', hashTrust: 'verified',
      baseSeverity: 'critical', baseConfidence: 'high', matched: 'deadbeef  C:/d/cheat.exe'
    })
  })

  it('keeps matched=null for findings with no keyword (e.g. VM)', () => {
    const out = classifyFindings([result('VM Scanner', ['VMware adapter detected'])], findKeyword)
    expect(out[0]).toMatchObject({ scannerId: 'vm', category: 'environment', baseSeverity: 'info', matched: null })
  })

  it('skips failed scanner results', () => {
    expect(classifyFindings([result('AppData Scanner', [], false)], findKeyword)).toEqual([])
  })

  it('produces stable ids for identical (scanner,value)', () => {
    const a = classifyFindings([result('AppData Scanner', ['undead'])], findKeyword)
    const b = classifyFindings([result('AppData Scanner', ['undead'])], findKeyword)
    expect(a[0].id).toBe(b[0].id)
  })
})

describe('correlate', () => {
  // Build classified findings for one signature spread across N scanners/categories.
  function findingsFor(signature: string, scanners: string[]) {
    return classifyFindings(
      scanners.map(s => result(s, [`x ${signature} y`])),
      () => signature
    )
  }

  it('does not correlate a signature confined to one category', () => {
    // appdata + recentfiles are both category 'file' → single category, no correlation
    const { correlations, findings } = correlate(findingsFor('undead', ['AppData Scanner', 'Recent Files Scanner']))
    expect(correlations).toHaveLength(0)
    expect(findings.every(f => f.confidence === 'low')).toBe(true)
  })

  it('correlates across 2 distinct categories → medium confidence', () => {
    const { correlations, findings } = correlate(findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner']))
    expect(correlations).toHaveLength(1)
    expect(correlations[0].strength).toBe(2)
    expect(correlations[0].confidence).toBe('medium')
    expect(findings.every(f => f.confidence === 'medium')).toBe(true)
    expect(findings.every(f => f.reasons.some(r => r.code === 'corroboration'))).toBe(true)
  })

  it('correlates across 3+ distinct categories → high confidence and ≥ high severity', () => {
    const { correlations, findings } = correlate(
      findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner', 'DNS Cache Scanner'])
    )
    expect(correlations[0].strength).toBe(3)
    expect(correlations[0].confidence).toBe('high')
    expect(findings.every(f => f.confidence === 'high')).toBe(true)
    expect(findings.every(f => f.severity === 'high' || f.severity === 'critical')).toBe(true)
  })

  it('does not mutate the input array elements', () => {
    const input = findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner'])
    correlate(input)
    expect(input.every(f => f.confidence === 'low')).toBe(true)
  })
})

describe('computeVerdict (conservative)', () => {
  function analyzed(scanners: string[], signature: string) {
    return correlate(classifyFindings(scanners.map(s => result(s, [`a ${signature} b`])), () => signature))
  }

  it('clean when there are no findings', () => {
    expect(computeVerdict([], []).band).toBe('clean')
  })

  it('clean when only environment/context findings with no keyword', () => {
    const f = classifyFindings([result('VM Scanner', ['VMware detected'])], () => null)
    expect(computeVerdict(f, []).band).toBe('clean')
  })

  it('low for one or two lone medium findings', () => {
    const f = classifyFindings([result('AppData Scanner', ['undead.exe'])], () => 'undead')
    expect(computeVerdict(f, []).band).toBe('low')
  })

  it('medium for 3+ distinct uncorroborated signatures', () => {
    const f = classifyFindings([
      result('AppData Scanner', ['a.exe']),
      result('Recent Files Scanner', ['b.exe']),
      result('Game Folder Scanner', ['c.exe'])
    ], (v) => v) // each value is its own signature; all category 'file' → no correlation
    expect(computeVerdict(f, []).band).toBe('medium')
  })

  it('high when a signature is corroborated across 2 categories', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner'], 'undead')
    const v = computeVerdict(findings, correlations)
    expect(v.band).toBe('high')
    expect(v.reasons.some(r => r.code === 'corroboration')).toBe(true)
  })

  it('critical when a signature is corroborated across 3+ categories', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner', 'DNS Cache Scanner'], 'undead')
    expect(computeVerdict(findings, correlations).band).toBe('critical')
  })

  it('critical for a verified hash on its own', () => {
    const f = classifyFindings([result('File Hash Scanner', ['deadbeef cheat.exe'])], () => null)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('critical')
    expect(v.reasons.some(r => r.code === 'verified-hash')).toBe(true)
  })

  it('caps a community hash at medium when uncorroborated', () => {
    const f = classifyFindings([result('File Hash Scanner', ['deadbeef cheat.exe'])], () => null)
    f[0].hashTrust = 'community'
    f[0].confidence = 'medium'
    f[0].baseConfidence = 'medium'
    expect(computeVerdict(f, []).band).toBe('medium')
  })

  it('always assigns a numeric score and a one-line rationale', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner'], 'undead')
    const v = computeVerdict(findings, correlations)
    expect(typeof v.score).toBe('number')
    expect(v.score).toBeGreaterThan(0)
    expect(v.rationale.length).toBeGreaterThan(0)
  })
})
