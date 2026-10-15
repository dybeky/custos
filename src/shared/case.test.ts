import { describe, it, expect } from 'vitest'
import type { AnalyzedFinding, ScanReport } from './types'
import { playerKey, type HistorySummary } from './history'
import { caseChecks, evidenceMatrix, evidenceStatus, listCases, matrixCounts } from './case'

const f = (
  id: string,
  scannerId: AnalyzedFinding['scannerId'],
  value: string,
  over: Partial<AnalyzedFinding> = {}
): AnalyzedFinding => ({
  id,
  scannerId,
  value,
  category: 'file',
  matched: 'undead',
  severity: 'medium',
  baseSeverity: 'medium',
  confidence: 'low',
  baseConfidence: 'low',
  correlationId: null,
  reasons: [],
  ...over
})
const rep = (id: string, findings: AnalyzedFinding[]): ScanReport => ({
  id,
  meta: {
    appVersion: '3',
    engineVersion: '1.2.0',
    scannedAt: '2026-09-20T10:00:00Z',
    durationMs: 1,
    gameId: 'unturned',
    signatureVersion: 'b'
  },
  verdict: { score: 25, band: 'low', rationale: '', reasons: [] },
  findings,
  correlations: [],
  scanners: []
})
const sum = (
  id: string,
  at: string,
  player: string,
  band: HistorySummary['band'] = 'low',
  score = 25
): HistorySummary => ({
  id,
  scannedAt: at,
  player,
  playerKey: playerKey(player),
  band,
  score,
  leads: 1,
  gameId: 'unturned'
})

describe('listCases / caseChecks', () => {
  const list = [
    sum('a', '2026-09-20T10:00:00Z', 'Neo (76561198012345678)'),
    sum('b', '2026-09-24T10:00:00Z', 'neo_renamed 76561198012345678', 'high', 70),
    sum('c', '2026-09-25T10:00:00Z', 'Trinity'),
    sum('d', '2026-09-26T10:00:00Z', '')
  ]

  it('groups checks by player (SteamID beats nickname), newest case first, skipping unnamed checks', () => {
    const cases = listCases(list)
    expect(cases.map((c) => c.key)).toEqual(['name:trinity', 'steam:76561198012345678'])
    expect(cases[1]).toMatchObject({
      player: 'neo_renamed 76561198012345678',
      checks: 2,
      lastBand: 'high',
      lastScore: 70
    })
  })

  it("lists one player's checks oldest first", () => {
    expect(caseChecks(list, 'steam:76561198012345678').map((c) => c.id)).toEqual(['a', 'b'])
    expect(caseChecks(list, 'name:nobody')).toEqual([])
  })
})

describe('evidenceStatus', () => {
  it('tells cleaned, new, persistent and intermittent apart', () => {
    expect(evidenceStatus([true, false])).toBe('cleaned')
    expect(evidenceStatus([true, true, false])).toBe('cleaned')
    expect(evidenceStatus([false, true])).toBe('new')
    expect(evidenceStatus([true, true])).toBe('persistent')
    expect(evidenceStatus([true])).toBe('persistent')
    expect(evidenceStatus([true, false, true])).toBe('intermittent')
  })
})

describe('evidenceMatrix', () => {
  const first = rep('1', [
    f('a', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 20/09/2026, 10:00', { severity: 'high' }),
    f('b', 'appdata', 'C:\\Users\\p\\AppData\\Roaming\\undead'),
    f('c', 'steam', '[Steam Account] x', { severity: 'info' })
  ])
  const second = rep('2', [
    f('d', 'prefetch', 'C:\\P\\UNDEAD.EXE-1.pf | last run 27/09/2026, 09:00', {
      severity: 'critical'
    }),
    f('e', 'recyclebin', '[Recycle Bin] C:\\x\\undead.exe', { severity: 'high' }),
    f('g', 'browserhistory', 'https://x.test', { dismissed: true })
  ])
  const rows = evidenceMatrix([first, second])

  it('follows one artifact across checks even when its times move', () => {
    const prefetch = rows.find((r) => r.scannerId === 'prefetch')!
    expect(prefetch.present).toEqual([true, true])
    expect(prefetch.status).toBe('persistent')
    expect(prefetch.severity).toBe('critical')
    expect(prefetch.value).toContain('27/09/2026')
  })

  it('flags what was cleaned and what is new, first', () => {
    expect(rows.map((r) => [r.scannerId, r.status])).toEqual([
      ['appdata', 'cleaned'],
      ['recyclebin', 'new'],
      ['prefetch', 'persistent']
    ])
  })

  it('leaves out information, dismissed and ignored findings', () => {
    expect(rows.some((r) => r.scannerId === 'steam' || r.scannerId === 'browserhistory')).toBe(
      false
    )
  })

  it('counts per status', () => {
    expect(matrixCounts(rows)).toEqual({ cleaned: 1, new: 1, persistent: 1, intermittent: 0 })
  })

  it('handles no reports', () => {
    expect(evidenceMatrix([])).toEqual([])
  })
})
