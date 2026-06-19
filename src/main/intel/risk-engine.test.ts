import { describe, it, expect } from 'vitest'
import { classifyFindings } from './risk-engine'
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
