// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteHistoryList } from './SiteHistoryList'
import { useScanStore } from '../../stores/scan-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'name' in o ? `${k}:${o.name}` : k),
    i18n: { language: 'en' }
  }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))

const row = (id: string, player: string, uploader: string) => ({
  id, scannedAt: '2026-09-01T10:00:00.000Z', band: 'high', score: 70, leads: 2, gameId: 'cs2',
  player, uploader, hashVerified: true, anonymous: false
})
const report = {
  id: 'scan_1',
  meta: { scannedAt: '2026-09-01T10:00:00.000Z' },
  verdict: { band: 'high', score: 70 },
  findings: [{ scannerId: 'steam', value: 'x', severity: 'high' }],
  correlations: [],
  scanners: [{ id: 'steam', name: 'Steam', success: true, durationMs: 1, count: 1 }]
}
const api = {
  getSiteChecks: vi.fn(async () => ({ ok: true, page: 1, pageSize: 50, total: 2, checks: [row('r1', 'Bob', 'mod1'), row('r2', 'Ann', 'mod2')] })),
  getSiteCheck: vi.fn(async () => ({ ok: true, uploader: 'mod1', anonymous: false, hashVerified: true, case: { player: 'Bob', notes: 'n' }, report }))
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).electronAPI = api
  useScanStore.getState().reset()
})

describe('SiteHistoryList', () => {
  it('lists who checked whom', async () => {
    render(<SiteHistoryList query="" onOpened={() => {}} />)
    expect(await screen.findByText('Bob')).toBeTruthy()
    expect(screen.getByText('Ann')).toBeTruthy()
    expect(screen.getByText(/history\.checkedBy:mod2/)).toBeTruthy()
    expect(api.getSiteChecks).toHaveBeenCalledWith(1, '')
  })

  it('marks a check seen before with a blurred placeholder and no readable text', async () => {
    api.getSiteChecks.mockResolvedValueOnce({
      ok: true, page: 1, pageSize: 50, total: 2,
      checks: [{ ...row('r1', 'Bob', 'mod1'), seenBefore: true }, row('r2', 'Ann', 'mod2')] as never
    })
    render(<SiteHistoryList query="" onOpened={() => {}} />)
    await screen.findByText('Bob')
    const marks = screen.getAllByTestId('seen-before')
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toMatch(/^▒+$/)
  })

  it('opens a check from the site read-only, with its case and per-scanner results', async () => {
    const onOpened = vi.fn()
    render(<SiteHistoryList query="" onOpened={onOpened} />)
    fireEvent.click(await screen.findByText('Bob'))
    await waitFor(() => expect(onOpened).toHaveBeenCalled())
    const s = useScanStore.getState()
    expect(api.getSiteCheck).toHaveBeenCalledWith('r1')
    expect(s.viewingHistory).toBe(true)
    expect(s.siteOrigin).toEqual({ uploader: 'mod1', anonymous: false, hashVerified: true })
    expect(s.caseInfo).toEqual({ player: 'Bob', notes: 'n' })
    expect(s.results.map((r) => r.scannerName)).toEqual(['Steam'])
    expect(s.report?.id).toBe('scan_1')
  })

  it('says so when the site refuses, and does not open anything', async () => {
    api.getSiteCheck.mockResolvedValueOnce({ ok: false, error: 'forbidden' } as never)
    const onOpened = vi.fn()
    render(<SiteHistoryList query="" onOpened={onOpened} />)
    fireEvent.click(await screen.findByText('Bob'))
    expect(await screen.findByText('site.errors.forbidden')).toBeTruthy()
    expect(onOpened).not.toHaveBeenCalled()
    expect(useScanStore.getState().siteOrigin).toBeNull()
  })

  it('shows the error with a retry when the list cannot be loaded', async () => {
    api.getSiteChecks.mockResolvedValueOnce({ ok: false, error: 'network' } as never)
    render(<SiteHistoryList query="" onOpened={() => {}} />)
    expect(await screen.findByText('site.errors.network')).toBeTruthy()
    fireEvent.click(screen.getByText('history.retry'))
    expect(await screen.findByText('Bob')).toBeTruthy()
  })
})
