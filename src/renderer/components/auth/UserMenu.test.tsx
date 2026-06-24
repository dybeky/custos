// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenu } from './UserMenu'
import { useAuthStore } from '../../stores/auth-store'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => {
  navigate.mockReset()
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = {
    login: vi.fn(async () => {}),
    cancelLogin: vi.fn(async () => {})
  }
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, isLoaded: true } as any)
})

const authed = {
  status: 'authed',
  user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' }
} as any

describe('UserMenu', () => {
  it('shows Sign in when anonymous', () => {
    render(<UserMenu />)
    expect(screen.getByText('auth.signIn')).toBeTruthy()
  })

  it('closing the login modal tears down any pending flow via cancel()', () => {
    render(<UserMenu />)
    fireEvent.click(screen.getByText('auth.signIn'))
    fireEvent.click(screen.getByLabelText('general.close'))
    expect((window as any).electronAPI.cancelLogin).toHaveBeenCalled()
  })

  it('authed: clicking the avatar navigates to /profile (no inline dropdown)', () => {
    useAuthStore.setState(authed)
    render(<UserMenu />)
    // The dropdown actions no longer render inline — they live on the Profile page.
    expect(screen.queryByText('auth.openProfile')).toBeNull()
    expect(screen.queryByText('auth.signOut')).toBeNull()
    fireEvent.click(screen.getByLabelText('nav.profile'))
    expect(navigate).toHaveBeenCalledWith('/profile')
  })

  it('authed: renders the avatar button (initials fallback for no image)', () => {
    useAuthStore.setState(authed)
    render(<UserMenu />)
    expect(screen.getByLabelText('nav.profile')).toBeTruthy()
    expect(screen.getByText('N')).toBeTruthy() // initials of "neo"
  })
})
