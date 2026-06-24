// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Profile } from './Profile'
import { useAuthStore } from '../stores/auth-store'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => {
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = {
    openProfile: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    login: vi.fn(async () => {}),
    cancelLogin: vi.fn(async () => {}),
    uploadAvatar: vi.fn(async () => ({ ok: true }))
  }
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, isLoaded: true } as any)
})

const authed = {
  status: 'authed',
  user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'owner', status: 'active' }
} as any

describe('Profile page', () => {
  it('anonymous: shows a sign-in prompt', () => {
    render(<Profile />)
    expect(screen.getByText('auth.signInToManage')).toBeTruthy()
  })

  it('authed: shows username, change-picture, open-profile, sign-out — and NO uid', () => {
    useAuthStore.setState(authed)
    render(<Profile />)
    expect(screen.getByText('neo')).toBeTruthy()
    expect(screen.getByText('auth.changePicture')).toBeTruthy()
    expect(screen.getByText('auth.openProfile')).toBeTruthy()
    expect(screen.getByText('auth.signOut')).toBeTruthy()
    // The UID must NOT appear anywhere in the desktop app (web-only).
    expect(screen.queryByText('#7')).toBeNull()
    expect(screen.queryByText(/#\s*\d/)).toBeNull()
  })

  it('authed: Open profile calls main; Sign out calls logout', () => {
    useAuthStore.setState(authed)
    render(<Profile />)
    fireEvent.click(screen.getByText('auth.openProfile'))
    expect((window as any).electronAPI.openProfile).toHaveBeenCalled()
    fireEvent.click(screen.getByText('auth.signOut'))
    expect((window as any).electronAPI.logout).toHaveBeenCalled()
  })
})
