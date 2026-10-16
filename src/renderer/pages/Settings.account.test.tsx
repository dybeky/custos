// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from './Settings'
import { useAuthStore } from '../stores/auth-store'

// Settings.tsx pulls in settings-store → i18n/index.ts, which calls
// i18n.use(initReactI18next) at import time. The mock must therefore expose
// initReactI18next (a no-op i18n plugin) alongside the stubbed useTranslation,
// or the real i18n bootstrap throws on import.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} }
}))
beforeEach(() => {
  ;(window as any).electronAPI = {
    openProfile: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    getSettings: vi.fn(async () => ({ colorTheme: 'violet' })),
    setSettings: vi.fn(async (s: object) => s)
  }
  useAuthStore.setState({ status: 'anon', user: null, isLoaded: true, updateRequired: undefined, capabilities: [] } as any)
})

describe('Settings Account card', () => {
  it('shows the account section and no palette swatches', () => {
    render(<Settings />)
    expect(screen.getByText('settings.account')).toBeTruthy()
    expect(screen.queryByText('#C8A47E')).toBeNull()
  })
  it('has an error-reports switch that is on by default and turns off', async () => {
    render(<Settings />)
    const sw = screen.getByText('settings.errorReports.toggle').closest('button') as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('false'))
    expect((window as any).electronAPI.setSettings).toHaveBeenCalledWith({ sendErrorReports: false })
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
