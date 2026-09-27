import { create } from 'zustand'
import i18n from '../i18n'
import type { UiMode } from '../../shared/types'

// Module-level debounce timer — avoids storing timers in React state
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

interface SettingsState {
  language: 'en' | 'ru'
  uiMode: UiMode
  isLoading: boolean
  version: string

  // Actions
  setLanguage: (value: 'en' | 'ru') => void
  setUiMode: (value: UiMode) => void
  setVersion: (version: string) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'en',
  uiMode: 'classic',
  isLoading: true,
  version: '',

  setLanguage: (value) => {
    set({ language: value })
    i18n.changeLanguage(value)
    get().saveSettings()
  },

  setUiMode: (value) => {
    set({ uiMode: value })
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()
      const language = settings.language === 'ru' ? 'ru' : 'en'
      const uiMode: UiMode = settings.uiMode === 'modern' ? 'modern' : 'classic'
      i18n.changeLanguage(language)
      set({ language, uiMode, version, isLoading: false })
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
        await window.electronAPI.setSettings({ language: get().language, uiMode: get().uiMode })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100) // 100ms debounce
  }
}))
