// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenu } from './UserMenu'
import { useAuthStore } from '../../stores/auth-store'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = {
    openProfile: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
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
    // The modal is open; close it via its close button (aria-label general.close).
    fireEvent.click(screen.getByLabelText('general.close'))
    expect((window as any).electronAPI.cancelLogin).toHaveBeenCalled()
  })

  it('shows the avatar + opens menu when authed, and Open profile calls main', () => {
    useAuthStore.setState(authed)
    render(<UserMenu />)
    fireEvent.click(screen.getByLabelText('auth.signIn'))
    fireEvent.click(screen.getByText('auth.openProfile'))
    expect((window as any).electronAPI.openProfile).toHaveBeenCalled()
  })

  it('Sign out calls logout()', () => {
    useAuthStore.setState(authed)
    render(<UserMenu />)
    fireEvent.click(screen.getByLabelText('auth.signIn'))
    fireEvent.click(screen.getByText('auth.signOut'))
    expect((window as any).electronAPI.logout).toHaveBeenCalled()
  })

  it('renders the role-coloured username in the dropdown', () => {
    useAuthStore.setState(authed)
    render(<UserMenu />)
    fireEvent.click(screen.getByLabelText('auth.signIn'))
    expect(screen.getByText('neo')).toBeTruthy()
  })
})
