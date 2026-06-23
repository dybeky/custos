// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoginModal } from './LoginModal'
import { useAuthStore } from '../../stores/auth-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.url ? `${k}:${o.url}` : k) })
}))

beforeEach(() => {
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, encryptionUnavailable: false, isLoaded: true } as any)
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = { login: vi.fn(async () => {}) }
})

describe('LoginModal', () => {
  it('shows both OAuth options and the device link', () => {
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('auth.continueGoogle')).toBeTruthy()
    expect(screen.getByText('auth.continueGithub')).toBeTruthy()
    expect(screen.getByText('auth.useCode')).toBeTruthy()
  })
  it('clicking Google calls login("google")', () => {
    render(<LoginModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByText('auth.continueGoogle'))
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('google')
  })
  it('renders the device code panel when device progress is present', () => {
    useAuthStore.setState({ device: { status: 'awaiting-approval', userCode: 'WXYZ-1234', verificationUri: 'https://97437.dev/device' } } as any)
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('WXYZ-1234')).toBeTruthy()
  })
})
