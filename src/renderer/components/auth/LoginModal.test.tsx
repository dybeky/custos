// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoginModal } from './LoginModal'
import { useAuthStore } from '../../stores/auth-store'
import { useAppHealthStore } from '../../stores/app-health-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.url ? `${k}:${o.url}` : k) })
}))

function setPlatform(platform: string) {
  useAppHealthStore.setState({ osInfo: { platform } as any, isLoaded: true } as any)
}

beforeEach(() => {
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, encryptionUnavailable: false, isLoaded: true } as any)
  setPlatform('windows') // default; non-Windows is covered explicitly below
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = { login: vi.fn(async () => {}) }
})

describe('LoginModal', () => {
  it('Windows: shows both OAuth options and the device link', () => {
    setPlatform('windows')
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('auth.continueGoogle')).toBeTruthy()
    expect(screen.getByText('auth.continueGithub')).toBeTruthy()
    expect(screen.getByText('auth.useCode')).toBeTruthy()
  })
  it('Windows: clicking Google calls login("google")', () => {
    setPlatform('windows')
    render(<LoginModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByText('auth.continueGoogle'))
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('google')
  })
  it('macOS: hides OAuth buttons and leads with the sign-in code (custos:// cannot return on macOS)', () => {
    setPlatform('macos')
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.queryByText('auth.continueGoogle')).toBeNull()
    expect(screen.queryByText('auth.continueGithub')).toBeNull()
    const codeBtn = screen.getByText('auth.continueCode')
    fireEvent.click(codeBtn)
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('device')
  })
  it('renders the device code panel when device progress is present', () => {
    useAuthStore.setState({ device: { status: 'awaiting-approval', userCode: 'WXYZ-1234', verificationUri: 'https://97437.dev/device' } } as any)
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('WXYZ-1234')).toBeTruthy()
  })
})
