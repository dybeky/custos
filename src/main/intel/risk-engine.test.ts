import { describe, it, expect } from 'vitest'
import { classifyFindings, correlate, computeVerdict, analyze, reportContentHash } from './risk-engine'
import type { AnalyzeContext } from './risk-engine'
import type { ScanResult } from '../../shared/types'
import { formatFileHashFinding } from './finding-tags'

function result(scannerName: string, findings: string[], success = true): ScanResult {
  const now = new Date(0)
  return { scannerName, success, findings, startTime: now, endTime: now, duration: 1, count: findings.length, hasFindings: findings.length > 0 }
}

// keyword matcher stub: a finding "matches" a signature if it contains it (case-insensitive)
const SIGS = ['undead', 'aimbot']
const findKeyword = (v: string): string | null =>
  SIGS.find(s => v.toLowerCase().includes(s)) ?? null

// A file-hash scanner finding for a known-cheat hash (content match).
const KNOWN = formatFileHashFinding('C:/d/cheat.exe', 'deadbeefdeadbeefdeadbeef', true)

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

  it('treats a known-hash content match as a verified hash: critical severity, high confidence', () => {
    const out = classifyFindings([result('File Hash Scanner', [KNOWN])], findKeyword)
    expect(out[0]).toMatchObject({
      scannerId: 'filehash', category: 'hash', hashTrust: 'verified',
      baseSeverity: 'critical', baseConfidence: 'high', matched: 'sha256:deadbeefdeadbeef'
    })
  })

  it('correlates a known-hash match on its keyword when the file name matches one', () => {
    const v = formatFileHashFinding('C:/d/undead.exe', 'deadbeefdeadbeefdeadbeef', true)
    expect(classifyFindings([result('File Hash Scanner', [v])], findKeyword)[0].matched).toBe('undead')
  })

  it('treats a file-hash FILE-NAME match as an ordinary file lead, never a verified hash', () => {
    const v = formatFileHashFinding('C:/Users/p/Downloads/undead.exe', 'abcabcabcabcabcabc', false)
    const out = classifyFindings([result('File Hash Scanner', [v])], findKeyword)
    expect(out[0]).toMatchObject({
      scannerId: 'filehash', category: 'file', hashTrust: undefined,
      baseSeverity: 'medium', confidence: 'low', matched: 'undead'
    })
    expect(computeVerdict(out, []).band).toBe('low')
  })

  it('treats unmatched context (Steam accounts) as informational, keeping the verdict clean', () => {
    const out = classifyFindings([result('Steam Scanner', [
      '[Steam Account] player1 (SteamID: 76561198000000000)',
      '[Steam] Steam installation not found'
    ])], findKeyword)
    expect(out.every(f => f.severity === 'info')).toBe(true)
    expect(computeVerdict(out, []).band).toBe('clean')
  })

  it('still counts a context finding that matches a keyword', () => {
    const out = classifyFindings([result('Steam Scanner', ['C:/Steam/undead_loader.exe'])], findKeyword)
    expect(out[0].severity).toBe('low')
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
    const f = classifyFindings([result('File Hash Scanner', [KNOWN])], () => null)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('critical')
    expect(v.reasons.some(r => r.code === 'verified-hash')).toBe(true)
  })

  it('caps a community hash at medium when uncorroborated', () => {
    const f = classifyFindings([result('File Hash Scanner', [KNOWN])], () => null)
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

describe('computeVerdict — Windows Defender', () => {
  it('a Defender cheat-family identification alone is High', () => {
    const f = classifyFindings([result('Defender History Scanner', [
      '[Defender] HackTool:Win64/GameHack.B | C:\\x\\loader.exe | 27/09/2026, 12:30 | action: Quarantine (cheat-family)'
    ])], findKeyword)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('high')
    expect(v.reasons[0].code).toBe('defender-cheat')
    expect(f[0].observedAt).toBeDefined()
  })

  it('a Defender detection matched only by file name stays an ordinary lead', () => {
    const f = classifyFindings([result('Defender History Scanner', [
      '[Defender] Trojan:Win32/Wacatac.B!ml | C:\\x\\undead.exe | 27/09/2026, 12:30'
    ])], findKeyword)
    expect(computeVerdict(f, []).band).toBe('low')
  })

  it('Defender counts as an independent artifact type for corroboration', () => {
    const { findings, correlations } = correlate(classifyFindings([
      result('Defender History Scanner', ['[Defender] Trojan:Win32/X | C:\\x\\undead.exe | 27/09/2026, 12:30']),
      result('Prefetch Scanner', ['C:\\Windows\\Prefetch\\UNDEAD.EXE-1.pf'])
    ], findKeyword))
    expect(correlations[0].categories.sort()).toEqual(['antivirus', 'execution'])
    expect(computeVerdict(findings, correlations).band).toBe('high')
  })
})

describe('computeVerdict — trace cleaning', () => {
  const trace = (v: string) => result('Anti-Forensics Scanner', [v])

  it('raises a machine with only trace cleaning to medium', () => {
    const f = classifyFindings([trace('[Trace cleaning] CCleaner was run 2026-09-27 13:40 UTC (5 min ago)')], findKeyword)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('medium')
    expect(v.reasons[0].code).toBe('trace-cleaning')
  })

  it('escalates trace cleaning plus a remaining cheat lead to high', () => {
    const f = classifyFindings([
      trace('[Trace cleaning] A Windows event log was cleared 2026-09-27 12:00 UTC (2 h ago)'),
      result('AppData Scanner', ['C:/x/undead.exe'])
    ], findKeyword)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('high')
    expect(v.reasons[0].code).toBe('trace-cleaning-with-leads')
  })

  it('does not lower a band that is already higher, but still records the reason', () => {
    const f = classifyFindings([
      trace('[Trace cleaning] Prefetch folder holds only 3 file(s)'),
      result('File Hash Scanner', [KNOWN])
    ], findKeyword)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('critical')
    expect(v.reasons.map(r => r.code)).toContain('trace-cleaning-with-leads')
  })

  it('does not treat informational context as a remaining lead', () => {
    const f = classifyFindings([
      trace('[Trace cleaning] Prefetch folder holds only 3 file(s)'),
      result('Steam Scanner', ['[Steam Account] p (SteamID: 76561198000000000)'])
    ], findKeyword)
    expect(computeVerdict(f, []).band).toBe('medium')
  })
})

describe('analyze', () => {
  const baseCtx: AnalyzeContext = {
    scanId: 'scan-1',
    scannedAt: '2026-06-19T00:00:00.000Z',
    durationMs: 1234,
    appVersion: '3.0.0',
    signatureVersion: 'bundled-1',
    gameId: 'unturned',
    os: { name: 'Windows 11', version: '11 24H2', arch: 'x64', appArch: 'x64' },
    findKeyword: (v: string) => (v.toLowerCase().includes('undead') ? 'undead' : null),
    suppression: { whitelistedSignatures: [], dismissedFindingIds: [] }
  }

  it('produces a full report with stamped meta', () => {
    const report = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    expect(report.id).toBe('scan-1')
    expect(report.meta.engineVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(report.meta.signatureVersion).toBe('bundled-1')
    expect(report.meta.gameId).toBe('unturned')
    expect(report.findings).toHaveLength(1)
    expect(report.scanners[0]).toMatchObject({ id: 'appdata', success: true, count: 1 })
  })

  it('sorts findings by severity then confidence (most serious first)', () => {
    const report = analyze([
      result('VM Scanner', ['vmware']),
      result('File Hash Scanner', [KNOWN])
    ], baseCtx)
    expect(report.findings[0].category).toBe('hash')
  })

  it('whitelisted signature is flagged and excluded from the verdict', () => {
    const ctx = { ...baseCtx, suppression: { whitelistedSignatures: ['undead'], dismissedFindingIds: [] } }
    const report = analyze([
      result('AppData Scanner', ['undead.exe']),
      result('BAM/DAM Scanner', ['ran undead'])
    ], ctx)
    expect(report.findings.every(f => f.whitelisted)).toBe(true)
    expect(report.verdict.band).toBe('clean') // the only evidence was whitelisted
  })

  it('dismissed finding id is flagged and excluded from the verdict', () => {
    const first = analyze([result('File Hash Scanner', [KNOWN])], baseCtx)
    const dismissedId = first.findings[0].id
    const ctx = { ...baseCtx, suppression: { whitelistedSignatures: [], dismissedFindingIds: [dismissedId] } }
    const report = analyze([result('File Hash Scanner', [KNOWN])], ctx)
    expect(report.findings[0].dismissed).toBe(true)
    expect(report.verdict.band).toBe('clean')
  })

  it('flags incomplete coverage when scanners failed, without changing the band', () => {
    const report = analyze([result('AppData Scanner', []), result('BAM/DAM Scanner', [], false)], baseCtx)
    expect(report.verdict.band).toBe('clean')
    const r = report.verdict.reasons.find(x => x.code === 'incomplete-coverage')
    expect(r?.params).toEqual({ failed: 1, total: 2 })
    expect(report.verdict.rationale).not.toMatch(/coverage/)
  })

  it('stamps a content hash that detects edits', () => {
    const report = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    expect(report.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(reportContentHash(report)).toBe(report.contentHash)
    const tampered = { ...report, verdict: { ...report.verdict, band: 'clean' as const } }
    expect(reportContentHash(tampered)).not.toBe(report.contentHash)
  })

  it('is deterministic — identical input yields identical output', () => {
    const a = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    const b = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
