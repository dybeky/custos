import { describe, it, expect } from 'vitest'
import type { AnalyzedFinding, ScanReport } from './types'
import { diffReports, findPrevious, findingIdentity, playerKey, summarize, type HistorySummary } from './history'

const f = (id: string, scannerId: AnalyzedFinding['scannerId'], value: string, over: Partial<AnalyzedFinding> = {}): AnalyzedFinding => ({
  id, scannerId, value, category: 'file', matched: 'undead', severity: 'medium', baseSeverity: 'medium',
  confidence: 'low', baseConfidence: 'low', correlationId: null, reasons: [], ...over
})
const rep = (id: string, scannedAt: string, findings: AnalyzedFinding[], band: ScanReport['verdict']['band'] = 'low', score = 25): ScanReport => ({
  id, meta: { appVersion: '3', engineVersion: '1.2.0', scannedAt, durationMs: 1, gameId: 'unturned', signatureVersion: 'b' },
  verdict: { score, band, rationale: '', reasons: [] }, findings, correlations: [], scanners: []
})

describe('playerKey', () => {
  it('prefers the SteamID64 so nickname changes still match', () => {
    expect(playerKey('Neo (76561198012345678)')).toBe('steam:76561198012345678')
    expect(playerKey('NewNick 76561198012345678')).toBe('steam:76561198012345678')
  })
  it('falls back to a normalized name, null when empty', () => {
    expect(playerKey('  Neo   The  One ')).toBe('name:neo the one')
    expect(playerKey('')).toBeNull()
    expect(playerKey(undefined)).toBeNull()
  })
})

describe('findPrevious', () => {
  const s = (id: string, at: string, player: string): HistorySummary => ({ id, scannedAt: at, player, playerKey: playerKey(player), band: 'low', score: 25, leads: 1, gameId: null })
  const list = [
    s('a', '2026-09-20T10:00:00Z', 'Neo (76561198012345678)'),
    s('b', '2026-09-24T10:00:00Z', 'neo_renamed 76561198012345678'),
    s('c', '2026-09-25T10:00:00Z', 'Trinity'),
    s('cur', '2026-09-27T10:00:00Z', 'Neo (76561198012345678)')
  ]
  it('returns the latest earlier check of the same player', () => {
    expect(findPrevious(list, 'cur', '2026-09-27T10:00:00Z', 'Neo (76561198012345678)')?.id).toBe('b')
  })
  it('returns null for an unknown or empty player', () => {
    expect(findPrevious(list, 'cur', '2026-09-27T10:00:00Z', 'Morpheus')).toBeNull()
    expect(findPrevious(list, 'cur', '2026-09-27T10:00:00Z', '')).toBeNull()
  })
  it('never returns a later check', () => {
    expect(findPrevious(list, 'a', '2026-09-20T10:00:00Z', 'Neo (76561198012345678)')).toBeNull()
  })
})

describe('diffReports', () => {
  it('ignores embedded times when matching the same artifact', () => {
    expect(findingIdentity(f('1', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 20/09/2026, 10:00')))
      .toBe(findingIdentity(f('2', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 27/09/2026, 09:00')))
  })

  it('lists new and vanished evidence and the verdict change', () => {
    const prev = rep('p', '2026-09-20T10:00:00Z', [
      f('1', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 20/09/2026, 10:00'),
      f('2', 'appdata', 'C:\\Users\\p\\AppData\\Roaming\\undead')
    ], 'low', 25)
    const curr = rep('c', '2026-09-27T10:00:00Z', [
      f('3', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 27/09/2026, 09:00'),
      f('4', 'recyclebin', '[Recycle Bin] C:\\x\\undead.exe | deleted 27/09/2026, 09:30'),
      f('5', 'steam', '[Steam Account] x', { severity: 'info' }),
      f('6', 'dnscache', '[DNS] undead.pro', { dismissed: true })
    ], 'high', 72)
    const d = diffReports(prev, curr)
    expect(d.added.map((x) => x.id)).toEqual(['4'])
    expect(d.removed.map((x) => x.id)).toEqual(['2'])
    expect(d.unchanged).toBe(1)
    expect([d.bandFrom, d.bandTo, d.scoreFrom, d.scoreTo]).toEqual(['low', 'high', 25, 72])
  })
})

describe('summarize', () => {
  it('builds a listing row', () => {
    const r = rep('x', '2026-09-27T10:00:00Z', [f('1', 'appdata', 'a'), f('2', 'steam', 'b', { severity: 'info' })], 'medium', 50)
    expect(summarize({ id: 'x', savedAt: '', report: r, results: [], case: { player: ' Neo ', notes: '' } })).toEqual({
      id: 'x', scannedAt: '2026-09-27T10:00:00Z', player: 'Neo', playerKey: 'name:neo', band: 'medium', score: 50, leads: 1, gameId: 'unturned'
    })
  })
})
