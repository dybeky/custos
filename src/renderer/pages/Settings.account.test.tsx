// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Settings } from './Settings'
import { useAuthStore } from '../stores/auth-store'

// Settings.tsx pulls in settings-store → i18n/index.ts, which calls
// i18n.use(initReactI18next) at import time. The mock must therefore expose
// initReactI18next (a no-op i18n plugin) alongside the stubbed useTranslation,
// or the real i18n bootstrap throws on import.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))
beforeEach(() => {
  ;(window as any).electronAPI = {
    openProfile: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    getSignatureStatus: vi.fn(async () => ({ enabled: true, version: 7, entries: 12 })),
    checkSignatures: vi.fn()
  }
  useAuthStore.setState({ status: 'anon', user: null, isLoaded: true, updateRequired: undefined, capabilities: [] } as any)
})

describe('Settings Account card', () => {
  it('shows the account section and no palette swatches', () => {
    render(<Settings />)
    expect(screen.getByText('settings.account')).toBeTruthy()
    expect(screen.queryByText('#C8A47E')).toBeNull()
  })
  it('shows which detection signatures are in use', async () => {
    render(<Settings />)
    expect(await screen.findByText('settings.signatures.site')).toBeTruthy()
    expect(screen.getByText('settings.signatures.check')).toBeTruthy()
  })
  it('warns when the site requires a newer app', () => {
    useAuthStore.setState({ status: 'anon', user: null, updateRequired: '9.0.0' } as any)
    render(<Settings />)
    expect(screen.getByText('site.updateRequired')).toBeTruthy()
  })
  it('shows the username when authed', () => {
    useAuthStore.setState({ status: 'authed', user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' } } as any)
    render(<Settings />)
    expect(screen.getByText('neo')).toBeTruthy()
  })
})
