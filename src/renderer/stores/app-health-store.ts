import { create } from 'zustand'
import { OsInfo, ScannerCapability } from '../../shared/types'

export type HealthStatus = 'healthy' | 'warning' | 'error'

interface AppHealthIssue {
  type: 'warning' | 'error'
  message: string
}

interface AppHealthState {
  status: HealthStatus
  osInfo: OsInfo | null
  capabilities: ScannerCapability[]
  isLoaded: boolean
  initialized: boolean
  issues: AppHealthIssue[]

  // Actions
  initialize: () => Promise<void>
  addIssue: (type: 'warning' | 'error', message: string) => void
  clearIssues: () => void
}

export const useAppHealthStore = create<AppHealthState>((set, get) => ({
  status: 'healthy',
  osInfo: null,
  capabilities: [],
  isLoaded: false,
  initialized: false,
  issues: [],

  initialize: async () => {
    // Guard against duplicate initialization (Header + Dashboard both call this)
    if (get().initialized) return
    set({ initialized: true })

    try {
      const [osInfo, capabilities] = await Promise.all([
        window.electronAPI.getOsInfo(),
        window.electronAPI.getCapabilities()
      ])
      set({ osInfo, capabilities, isLoaded: true })

      // Surface unsupported features as a warning in the header status dot
      const unsupported = capabilities.filter((c) => !c.supported).length
      if (unsupported > 0) {
        get().addIssue('warning', `${unsupported} feature(s) unavailable on ${osInfo.name}`)
      }
    } catch {
      set({ isLoaded: true })
      get().addIssue('warning', 'Failed to detect operating system')
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
