import { create } from 'zustand'

export type ThemeName = 'aurora' | 'mono'

interface SettingsState {
  language: 'en' | 'ru'
  checkUpdatesOnStartup: boolean
  autoDownloadUpdates: boolean
  deleteAfterUse: boolean
  isLoading: boolean
  version: string
  effectsEnabled: boolean
  theme: ThemeName
  saveDebounceTimer: ReturnType<typeof setTimeout> | null

  // Actions
  setLanguage: (value: 'en' | 'ru') => void
  setCheckUpdatesOnStartup: (value: boolean) => void
  setAutoDownloadUpdates: (value: boolean) => void
  setDeleteAfterUse: (value: boolean) => void
  setVersion: (version: string) => void
  setEffectsEnabled: (value: boolean) => void
  toggleEffects: () => void
  setTheme: (theme: ThemeName) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'en',
  checkUpdatesOnStartup: true,
  autoDownloadUpdates: false,
  deleteAfterUse: false,
  isLoading: true,
  version: '2.1.0',
  effectsEnabled: true,
  theme: 'aurora' as ThemeName,
  saveDebounceTimer: null,

  setLanguage: (value) => {
    set({ language: value })
    get().saveSettings()
  },

  setCheckUpdatesOnStartup: (value) => {
    set({ checkUpdatesOnStartup: value })
    get().saveSettings()
  },

  setAutoDownloadUpdates: (value) => {
    set({ autoDownloadUpdates: value })
    get().saveSettings()
  },

  setDeleteAfterUse: (value) => {
    set({ deleteAfterUse: value })
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  setEffectsEnabled: (value) => set({ effectsEnabled: value }),

  toggleEffects: () => set((state) => ({ effectsEnabled: !state.effectsEnabled })),

  setTheme: (theme) => {
    set({ theme })
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme)
    // Save to localStorage for persistence
    localStorage.setItem('custos-theme', theme)
  },

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()

      // Load theme from localStorage
      const savedTheme = localStorage.getItem('custos-theme') as ThemeName | null
      const theme = savedTheme && ['aurora', 'mono'].includes(savedTheme) ? savedTheme : 'aurora'
      document.documentElement.setAttribute('data-theme', theme)

      set({
        language: settings.language,
        checkUpdatesOnStartup: settings.checkUpdatesOnStartup,
        autoDownloadUpdates: settings.autoDownloadUpdates,
        deleteAfterUse: settings.deleteAfterUse,
        version,
        theme,
        isLoading: false
      })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ isLoading: false })
    }
  },

  saveSettings: async () => {
    const state = get()

    // Debounce save to prevent race conditions with rapid toggles
    if (state.saveDebounceTimer) {
      clearTimeout(state.saveDebounceTimer)
    }

    const timer = setTimeout(async () => {
      try {
        await window.electronAPI.setSettings({
          language: state.language,
          checkUpdatesOnStartup: state.checkUpdatesOnStartup,
          autoDownloadUpdates: state.autoDownloadUpdates,
          deleteAfterUse: state.deleteAfterUse
        })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100) // 100ms debounce

    set({ saveDebounceTimer: timer })
  }
}))
