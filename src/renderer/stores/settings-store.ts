import { create } from 'zustand'

export type ThemeName = 'aurora' | 'mono' | 'tropical'

// Module-level debounce timer — avoids storing timers in React state
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

interface SettingsState {
  language: 'en' | 'ru'
  checkUpdatesOnStartup: boolean
  autoDownloadUpdates: boolean
  deleteAfterUse: boolean
  disableHardwareAcceleration: boolean
  isLoading: boolean
  version: string
  effectsEnabled: boolean
  theme: ThemeName

  // Actions
  setLanguage: (value: 'en' | 'ru') => void
  setCheckUpdatesOnStartup: (value: boolean) => void
  setAutoDownloadUpdates: (value: boolean) => void
  setDeleteAfterUse: (value: boolean) => void
  setDisableHardwareAcceleration: (value: boolean) => void
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
  disableHardwareAcceleration: false,
  isLoading: true,
  version: '',
  effectsEnabled: true,
  theme: 'tropical' as ThemeName,

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

  setDisableHardwareAcceleration: (value) => {
    set({ disableHardwareAcceleration: value })
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  setEffectsEnabled: (value) => set({ effectsEnabled: value }),

  toggleEffects: () => set((state) => ({ effectsEnabled: !state.effectsEnabled })),

  setTheme: (theme) => {
    set({ theme })
    document.documentElement.setAttribute('data-theme', theme)
    get().saveSettings()
  },

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()

      const theme = settings.theme && ['aurora', 'mono', 'tropical'].includes(settings.theme)
        ? settings.theme as ThemeName
        : 'tropical'
      document.documentElement.setAttribute('data-theme', theme)

      set({
        language: settings.language,
        checkUpdatesOnStartup: settings.checkUpdatesOnStartup,
        autoDownloadUpdates: settings.autoDownloadUpdates,
        deleteAfterUse: settings.deleteAfterUse,
        disableHardwareAcceleration: settings.disableHardwareAcceleration ?? false,
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
    // Debounce save to prevent race conditions with rapid toggles
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }

    saveDebounceTimer = setTimeout(async () => {
      saveDebounceTimer = null
      try {
        // Get fresh state inside setTimeout to capture latest changes
        const freshState = get()
        await window.electronAPI.setSettings({
          language: freshState.language,
          checkUpdatesOnStartup: freshState.checkUpdatesOnStartup,
          autoDownloadUpdates: freshState.autoDownloadUpdates,
          deleteAfterUse: freshState.deleteAfterUse,
          theme: freshState.theme,
          disableHardwareAcceleration: freshState.disableHardwareAcceleration
        })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100) // 100ms debounce
  }
}))
