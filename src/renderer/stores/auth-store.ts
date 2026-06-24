import { create } from 'zustand'
import type { AuthState, AuthProvider, PublicUser, DeviceProgress } from '../../shared/types'

interface AuthStore {
  status: AuthState['status']
  user: PublicUser | null
  device?: DeviceProgress
  encryptionUnavailable: boolean
  isLoaded: boolean
  init: () => Promise<void>
  login: (provider: AuthProvider) => Promise<void>
  cancel: () => Promise<void>
  logout: () => Promise<void>
  uploadAvatar: (bytes: ArrayBuffer, mime: string) => Promise<{ ok: boolean; error?: string }>
  _apply: (state: AuthState) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'anon',
  user: null,
  device: undefined,
  encryptionUnavailable: false,
  isLoaded: false,

  _apply: (state) =>
    set({
      status: state.status,
      user: state.user,
      device: state.device,
      encryptionUnavailable: !!state.encryptionUnavailable
    }),

  init: async () => {
    window.electronAPI.onAuthChanged((s) => useAuthStore.getState()._apply(s))
    try {
      const state = await window.electronAPI.getAuthState()
      useAuthStore.getState()._apply(state)
    } catch {
      // leave defaults (anon) — scanner is unaffected (PR-1)
    }
    set({ isLoaded: true })
  },

  login: (provider) => window.electronAPI.login(provider),
  cancel: () => window.electronAPI.cancelLogin(),
  logout: () => window.electronAPI.logout(),
  uploadAvatar: (bytes, mime) => window.electronAPI.uploadAvatar(bytes, mime)
}))
