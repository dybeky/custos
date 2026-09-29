import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ScanReport } from '../../shared/types'
import { useScanStore } from './scan-store'
import { useAuthStore } from './auth-store'
import { startSiteSync, useSiteSync } from './site-sync'

const report = (id: string): ScanReport => ({
  id,
  meta: { appVersion: '3.0.1', engineVersion: '1', scannedAt: '2026-09-29T00:00:00.000Z', durationMs: 1, gameId: 'unturned', signatureVersion: 'b' },
  verdict: { score: 0, band: 'clean', rationale: '', reasons: [] },
  findings: [],
  correlations: [],
  scanners: []
})

const upload = vi.fn(async () => ({ ok: true, url: 'https://97437.dev/admin/reports/r1', hashVerified: true }))
let stop: () => void

function finishScan(id: string, opts: { viewingHistory?: boolean } = {}): void {
  useScanStore.setState({ status: 'completed', report: report(id), caseInfo: { player: 'Bob (76561198012345678)', notes: '' }, viewingHistory: !!opts.viewingHistory })
}

beforeEach(() => {
  vi.useFakeTimers()
  upload.mockClear()
  vi.stubGlobal('window', { electronAPI: { uploadCheckToSite: upload, listHistory: async () => [], getHistory: async () => null, setHistoryCase: async () => [] } })
  useScanStore.setState({ status: 'idle', report: null, caseInfo: { player: '', notes: '' }, checker: '', viewingHistory: false })
  useAuthStore.setState({ status: 'anon', user: null, capabilities: [], updateRequired: undefined })
  useSiteSync.setState({ reportId: null, uploading: false, result: null })
  stop = startSiteSync()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('site auto-sync', () => {
  it('uploads a finished check once without any sign-in, with the detected player', async () => {
    finishScan('scan-1')
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith('scan-1', 'Bob (76561198012345678)', '', '')
    expect(useSiteSync.getState()).toMatchObject({ reportId: 'scan-1', result: { ok: true } })
  })

  it('sends the typed checker, else the signed-in account name', async () => {
    useScanStore.setState({ checker: '  Anna ' })
    finishScan('scan-2')
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenLastCalledWith('scan-2', expect.any(String), '', 'Anna')
    useScanStore.setState({ checker: '' })
    useAuthStore.setState({ status: 'authed', user: { username: 'mod1' } } as never)
    finishScan('scan-3')
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenLastCalledWith('scan-3', expect.any(String), '', 'mod1')
  })

  it('leaves checks reopened from history alone, and waits while the app is too old', async () => {
    finishScan('scan-4', { viewingHistory: true })
    useAuthStore.setState({ updateRequired: '9.0.0' })
    finishScan('scan-5')
    await vi.runAllTimersAsync()
    expect(upload).not.toHaveBeenCalled()
  })

  it('re-sends notes and the checker once the checker pauses typing', async () => {
    finishScan('scan-6')
    await vi.runAllTimersAsync()
    useScanStore.setState({ caseInfo: { player: 'Bob (76561198012345678)', notes: 'a' } })
    useScanStore.setState({ caseInfo: { player: 'Bob (76561198012345678)', notes: 'ab' }, checker: 'Anna' })
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenLastCalledWith('scan-6', 'Bob (76561198012345678)', 'ab', 'Anna')
  })
})
