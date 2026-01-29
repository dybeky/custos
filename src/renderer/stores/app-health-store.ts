import { create } from 'zustand'
import { WindowsVersionInfo } from '../../shared/types'

export type HealthStatus = 'healthy' | 'warning' | 'error'

interface AppHealthIssue {
  type: 'warning' | 'error'
  message: string
}

interface AppHealthState {
  status: HealthStatus
  windowsVersion: WindowsVersionInfo | null
  isLoaded: boolean
  issues: AppHealthIssue[]

  // Actions
  initialize: () => Promise<void>
  addIssue: (type: 'warning' | 'error', message: string) => void
  clearIssues: () => void
}

export const useAppHealthStore = create<AppHealthState>((set, get) => ({
  status: 'healthy',
  windowsVersion: null,
  isLoaded: false,
  issues: [],

  initialize: async () => {
    try {
      const version = await window.electronAPI.getWindowsVersion()
      set({ windowsVersion: version, isLoaded: true })
    } catch {
      set({ isLoaded: true })
      get().addIssue('warning', 'Failed to detect Windows version')
    }
  },

  addIssue: (type, message) => {
    set((state) => {
      const issues = [...state.issues, { type, message }]
      const hasError = issues.some(i => i.type === 'error')
      const hasWarning = issues.some(i => i.type === 'warning')
      return {
        issues,
        status: hasError ? 'error' : hasWarning ? 'warning' : 'healthy'
      }
    })
  },

  clearIssues: () => set({ issues: [], status: 'healthy' })
}))
