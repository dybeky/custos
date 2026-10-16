// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SitePanel } from './SitePanel'
import { useAuthStore } from '../../stores/auth-store'
import { useScanStore } from '../../stores/scan-store'
import { useSiteSync } from '../../stores/site-sync'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))

const report = { id: 'scan_1', meta: { scannedAt: '2026-09-01T10:00:00.000Z' } } as any
const api = {
  uploadCheckToSite: vi.fn(async () => ({ ok: true, url: 'https://97437.dev/admin/reports/r1', hashVerified: true })),
  getSitePlayerChecks: vi.fn(async () => ({
    ok: true,
    checks: [
      { id: 'r1', scannedAt: '2026-09-01T10:00:00.000Z', band: 'high', score: 70, leads: 2, gameId: null, player: 'Bob', uploader: 'me', hashVerified: true },
      { id: 'r0', scannedAt: '2026-08-01T10:00:00.000Z', band: 'clean', score: 0, leads: 0, gameId: null, player: 'Bob', uploader: 'mod2', hashVerified: true }
    ]
  })),
  openOnSite: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).electronAPI = api
  useScanStore.setState({ report, caseInfo: { player: 'Bob', notes: 'n' } } as any)
  useSiteSync.setState({ reportId: null, uploading: false, result: null })
})

describe('SitePanel', () => {
  it('has no manual upload button: checks are saved to the site on their own', () => {
    useAuthStore.setState({ status: 'anon', capabilities: [], updateRequired: undefined } as any)
    render(<SitePanel />)
    expect(screen.queryByText('site.upload')).toBeNull()
    expect(screen.queryByText('site.reupload')).toBeNull()
    expect(screen.queryByText('site.playerHistory')).toBeNull()
  })

  it('shows how the automatic save went', () => {
    useAuthStore.setState({ status: 'authed', capabilities: ['upload_reports'], updateRequired: undefined } as any)
    useSiteSync.setState({ reportId: 'scan_1', uploading: false, result: { ok: true, url: 'https://97437.dev/admin/reports/r1', hashVerified: true } })
    render(<SitePanel />)
    expect(screen.getByText('site.uploadedIntact')).toBeTruthy()
    // Opening it on the site, like the player's history, needs the view right.
    expect(screen.queryByText('site.openCheck')).toBeNull()
    expect(screen.queryByText('site.playerHistory')).toBeNull()
  })

  it('offers to open the saved check to staff who can view checks', () => {
    useAuthStore.setState({ status: 'authed', capabilities: ['view_reports'], updateRequired: undefined } as any)
    useSiteSync.setState({ reportId: 'scan_1', uploading: false, result: { ok: true, url: 'https://97437.dev/admin/reports/r1', hashVerified: true } })
    render(<SitePanel />)
    fireEvent.click(screen.getByText('site.openCheck'))
    expect(api.openOnSite).toHaveBeenCalledWith({ checkId: 'r1' })
  })

  it('shows a failed save', () => {
    useAuthStore.setState({ status: 'anon', capabilities: [], updateRequired: undefined } as any)
    useSiteSync.setState({ reportId: 'scan_1', uploading: false, result: { ok: false, error: 'network' } })
    render(<SitePanel />)
    expect(screen.getByText('site.errors.network')).toBeTruthy()
  })

  it("lists the player's other checks on the site", async () => {
    useAuthStore.setState({ status: 'authed', capabilities: ['view_reports'], updateRequired: undefined } as any)
    render(<SitePanel />)
    fireEvent.click(screen.getByText('site.playerHistory'))
    expect(await screen.findByText('mod2')).toBeTruthy()
    expect(screen.queryByText('me')).toBeNull() // this very check is not listed
    fireEvent.click(screen.getByText('site.openPlayer'))
    expect(api.openOnSite).toHaveBeenCalledWith({ player: 'Bob' })
  })

  it('explains when the app is too old for the site', () => {
    useAuthStore.setState({ status: 'authed', capabilities: [], updateRequired: '9.0.0' } as any)
    render(<SitePanel />)
    expect(screen.getByText('site.updateRequired')).toBeTruthy()
    expect(screen.queryByText('site.upload')).toBeNull()
  })
})
