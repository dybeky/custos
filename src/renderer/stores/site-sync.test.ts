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

function signIn(capabilities = ['upload_reports']): void {
  useAuthStore.setState({ status: 'authed', capabilities, updateRequired: undefined })
}

beforeEach(() => {
  vi.useFakeTimers()
  upload.mockClear()
  vi.stubGlobal('window', { electronAPI: { uploadCheckToSite: upload, listHistory: async () => [], getHistory: async () => null, setHistoryCase: async () => [] } })
  useScanStore.setState({ status: 'idle', report: null, caseInfo: { player: '', notes: '' }, viewingHistory: false })
  useAuthStore.setState({ status: 'anon', capabilities: [], updateRequired: undefined })
  useSiteSync.setState({ reportId: null, uploading: false, result: null })
  stop = startSiteSync()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('site auto-sync', () => {
  it('uploads a finished check once, with the detected player', async () => {
    signIn()
    finishScan('scan-1')
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith('scan-1', 'Bob (76561198012345678)', '')
    expect(useSiteSync.getState()).toMatchObject({ reportId: 'scan-1', result: { ok: true } })
  })

  it('waits for sign-in, then uploads the check on screen', async () => {
    finishScan('scan-2')
    await vi.runAllTimersAsync()
    expect(upload).not.toHaveBeenCalled()
    signIn()
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledWith('scan-2', expect.any(String), '')
  })

  it('never uploads without the upload right or for a check reopened from history', async () => {
    signIn(['view_reports'])
    finishScan('scan-3')
    await vi.runAllTimersAsync()
    finishScan('scan-4', { viewingHistory: true })
    signIn()
    await vi.runAllTimersAsync()
    expect(upload).not.toHaveBeenCalled()
  })

  it('re-sends notes once the checker pauses typing', async () => {
    signIn()
    finishScan('scan-5')
    await vi.runAllTimersAsync()
    useScanStore.setState({ caseInfo: { player: 'Bob (76561198012345678)', notes: 'a' } })
    useScanStore.setState({ caseInfo: { player: 'Bob (76561198012345678)', notes: 'ab' } })
    await vi.runAllTimersAsync()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenLastCalledWith('scan-5', 'Bob (76561198012345678)', 'ab')
  })
})
