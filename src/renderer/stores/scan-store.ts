import { create } from 'zustand'
import { ScanResult, ScanProgress, ScannerInfo } from '../../shared/types'

export type ScanStatus = 'idle' | 'scanning' | 'completed' | 'error'

interface ScanState {
  status: ScanStatus
  progress: ScanProgress | null
  results: ScanResult[]
  scanners: ScannerInfo[]
  error: string | null

  // Actions
  setStatus: (status: ScanStatus) => void
  setProgress: (progress: ScanProgress | null) => void
  addResult: (result: ScanResult) => void
  setResults: (results: ScanResult[]) => void
  setScanners: (scanners: ScannerInfo[]) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useScanStore = create<ScanState>((set) => ({
  status: 'idle',
  progress: null,
  results: [],
  scanners: [],
  error: null,

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  addResult: (result) => set((state) => ({ results: [...state.results, result] })),
  setResults: (results) => set({ results }),
  setScanners: (scanners) => set({ scanners }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  reset: () => set({ status: 'idle', progress: null, results: [], error: null })
}))

// Computed values
export const useTotalFindings = () => useScanStore((state) =>
  state.results.reduce((total, result) => total + result.findings.length, 0)
)

export const useHasFindings = () => useScanStore((state) =>
  state.results.some((result) => result.hasFindings)
)
