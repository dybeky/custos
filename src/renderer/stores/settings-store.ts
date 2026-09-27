import { create } from 'zustand'
import type { UiMode } from '../../shared/types'

// Module-level debounce timer — avoids storing timers in React state
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

interface SettingsState {
  uiMode: UiMode
  isLoading: boolean
  version: string

  // Actions
  setUiMode: (value: UiMode) => void
  setVersion: (version: string) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiMode: 'classic',
  isLoading: true,
  version: '',

  setUiMode: (value) => {
    set({ uiMode: value })
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()
      const uiMode: UiMode = settings.uiMode === 'modern' ? 'modern' : 'classic'
      set({ uiMode, version, isLoading: false })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ isLoading: false })
    }
  },

  saveSettings: async () => {
    // Debounce save to prevent race conditions with rapid toggles
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
    saveDebounceTimer = setTimeout(async () => {
      saveDebounceTimer = null
      try {
        await window.electronAPI.setSettings({ uiMode: get().uiMode })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100) // 100ms debounce
  }
}))
