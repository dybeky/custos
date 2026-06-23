import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthState } from '../../shared/types'

const authed: AuthState = {
  status: 'authed',
  user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' }
}

let changedCb: ((s: AuthState) => void) | null = null
beforeEach(() => {
  changedCb = null
  ;(globalThis as any).window = {
    electronAPI: {
      getAuthState: vi.fn(async () => ({ status: 'anon', user: null }) as AuthState),
      login: vi.fn(async () => {}),
      cancelLogin: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      onAuthChanged: vi.fn((cb: any) => { changedCb = cb; return () => {} })
    }
  }
  vi.resetModules()
})

describe('useAuthStore', () => {
  it('hydrates from getAuthState and applies pushed changes', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().status).toBe('anon')
    expect(useAuthStore.getState().isLoaded).toBe(true)
    changedCb?.(authed)
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.username).toBe('neo')
  })
  it('login delegates to electronAPI', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('github')
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('github')
  })
})
