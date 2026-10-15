import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScanReport, SitePrevious, SitePreviousResult } from '../../shared/types'

// "Seen before": after a check, the store asks the site for this player's previous
// check — also on a PC that has no history of its own — and keeps what changed.

const finding = (id: string, value: string) => ({
  id,
  scannerId: 'appdata',
  value,
  category: 'file',
  matched: 'undead',
  severity: 'high',
  baseSeverity: 'high',
  confidence: 'low',
  baseConfidence: 'low',
  correlationId: null,
  reasons: []
})
const report = (id: string, at: string, values: string[]): ScanReport =>
  ({
    id,
    meta: {
      appVersion: '3.3.0',
      engineVersion: '1',
      scannedAt: at,
      durationMs: 1,
      gameId: 'unturned',
      signatureVersion: 'b'
    },
    verdict: { score: 70, band: 'high', rationale: '', reasons: [] },
    findings: values.map((v, i) => finding(`f${i}`, v)),
    correlations: [],
    scanners: []
  }) as unknown as ScanReport

const previous: SitePrevious = {
  id: 's1',
  scannedAt: '2026-10-01T10:00:00.000Z',
  band: 'medium',
  score: 40,
  leads: 2,
  uploader: 'mod',
  hashVerified: true,
  anonymous: false,
  total: 3,
  findings: [
    {
      id: 'p1',
      scannerId: 'appdata',
      value: 'C:/x/undead',
      matched: 'undead',
      severity: 'high',
      category: 'file'
    },
    {
      id: 'p2',
      scannerId: 'appdata',
      value: 'C:/y/aimbot.exe',
      matched: 'aimbot',
      severity: 'high',
      category: 'file'
    }
  ]
}

let api: Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => {
  api = {
    listHistory: vi.fn(async () => []),
    getHistory: vi.fn(async () => null),
    setHistoryCase: vi.fn(async () => []),
    getSitePreviousCheck: vi.fn(async (): Promise<SitePreviousResult> => ({ ok: true, previous }))
  }
  ;(globalThis as any).window = { electronAPI: api }
  vi.resetModules()
})

describe('scan store: seen before', () => {
  it('finds the player on the site and diffs the evidence, with no local history at all', async () => {
    const { useScanStore } = await import('./scan-store')
    useScanStore.setState({
      report: report('r1', '2026-10-10T10:00:00.000Z', ['C:/x/undead', 'C:/z/loader.exe']),
      caseInfo: { player: 'Neo (76561198012345678)', notes: '' }
    } as any)
    await useScanStore.getState().refreshSiteSeen()
    const seen = useScanStore.getState().siteSeen!
    expect(api.getSitePreviousCheck).toHaveBeenCalledWith(
      'Neo (76561198012345678)',
      '2026-10-10T10:00:00.000Z'
    )
    expect(seen.previous.total).toBe(3)
    expect(seen.diff.added.map((f) => f.value)).toEqual(['C:/z/loader.exe'])
    expect(seen.diff.removed.map((f) => f.value)).toEqual(['C:/y/aimbot.exe'])
    expect(seen.diff.unchanged).toBe(1)
    expect([seen.diff.bandFrom, seen.diff.bandTo]).toEqual(['medium', 'high'])
  })

  it('says nothing for a first check, a signed-out checker, or an unnamed player', async () => {
    const { useScanStore } = await import('./scan-store')
    const base = {
      report: report('r1', '2026-10-10T10:00:00.000Z', ['a']),
      caseInfo: { player: 'Neo', notes: '' }
    }

    api.getSitePreviousCheck.mockResolvedValueOnce({ ok: true, previous: null })
    useScanStore.setState(base as any)
    await useScanStore.getState().refreshSiteSeen()
    expect(useScanStore.getState().siteSeen).toBeNull()

    api.getSitePreviousCheck.mockResolvedValueOnce({ ok: false, error: 'not_signed_in' })
    await useScanStore.getState().refreshSiteSeen()
    expect(useScanStore.getState().siteSeen).toBeNull()

    api.getSitePreviousCheck.mockClear()
    useScanStore.setState({ ...base, caseInfo: { player: '  ', notes: '' } } as any)
    await useScanStore.getState().refreshSiteSeen()
    expect(api.getSitePreviousCheck).not.toHaveBeenCalled()
  })

  it('survives the bridge failing, and ignores an answer for a player that was changed meanwhile', async () => {
    const { useScanStore } = await import('./scan-store')
    useScanStore.setState({
      report: report('r1', '2026-10-10T10:00:00.000Z', ['a']),
      caseInfo: { player: 'Neo', notes: '' }
    } as any)
    api.getSitePreviousCheck.mockRejectedValueOnce(new Error('boom'))
    await useScanStore.getState().refreshSiteSeen()
    expect(useScanStore.getState().siteSeen).toBeNull()

    api.getSitePreviousCheck.mockImplementationOnce(async () => {
      useScanStore.setState({ caseInfo: { player: 'Trinity', notes: '' } } as any)
      return { ok: true, previous }
    })
    await useScanStore.getState().refreshSiteSeen()
    expect(useScanStore.getState().siteSeen).toBeNull()
  })
})
