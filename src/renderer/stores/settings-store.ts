import { create } from 'zustand'
import { DEFAULT_THEME, isColorTheme, type ColorTheme } from '../../shared/themes'

const THEME_CACHE_KEY = 'custos-theme'

/** Last theme, cached so the first paint is already in the right colors. */
function readCachedTheme(): ColorTheme {
  try {
    const v = globalThis.localStorage?.getItem(THEME_CACHE_KEY)
    return isColorTheme(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/** Switch the document to `theme` (CSS reads <html data-theme>) and cache it. */
export function applyTheme(theme: ColorTheme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
  try {
    globalThis.localStorage?.setItem(THEME_CACHE_KEY, theme)
  } catch {
    // storage unavailable — the saved setting still applies after load
  }
}

// Module-level debounce timer — avoids storing timers in React state
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

interface SettingsState {
  colorTheme: ColorTheme
  isLoading: boolean
  version: string

  // Actions
  setColorTheme: (value: ColorTheme) => void
  setVersion: (version: string) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  colorTheme: readCachedTheme(),
  isLoading: true,
  version: '',

  setColorTheme: (value) => {
    applyTheme(value)
    set({ colorTheme: value })
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()
      const colorTheme = isColorTheme(settings.colorTheme) ? settings.colorTheme : DEFAULT_THEME
      applyTheme(colorTheme)
      set({ colorTheme, version, isLoading: false })
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
        await window.electronAPI.setSettings({ colorTheme: get().colorTheme })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100) // 100ms debounce
  }
}))
