import { create } from 'zustand'
import { shallow } from 'zustand/shallow'
import { ScanResult, ScanProgress, ScannerInfo } from '../../shared/types'

export type ScanStatus = 'idle' | 'scanning' | 'completed' | 'error'

interface ScanState {
  status: ScanStatus
  progress: ScanProgress | null
  results: ScanResult[]
  scanners: ScannerInfo[]
  error: string | null

  // Memoized computed values (updated on state change)
  _totalFindings: number
  _hasFindings: boolean
  _successfulScans: number
  _failedScans: number

  // Actions
  setStatus: (status: ScanStatus) => void
  setProgress: (progress: ScanProgress | null) => void
  addResult: (result: ScanResult) => void
  setResults: (results: ScanResult[]) => void
  setScanners: (scanners: ScannerInfo[]) => void
  setError: (error: string | null) => void
  reset: () => void
}

// Helper to compute derived values
const computeDerivedValues = (results: ScanResult[]) => ({
  _totalFindings: results.reduce((total, result) => total + result.findings.length, 0),
  _hasFindings: results.some((result) => result.hasFindings),
  _successfulScans: results.filter((result) => result.success).length,
  _failedScans: results.filter((result) => !result.success).length
})

export const useScanStore = create<ScanState>((set) => ({
  status: 'idle',
  progress: null,
  results: [],
  scanners: [],
  error: null,

  // Initial computed values
  _totalFindings: 0,
  _hasFindings: false,
  _successfulScans: 0,
  _failedScans: 0,

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),

  addResult: (result) => set((state) => {
    const newResults = [...state.results, result]
    return {
      results: newResults,
      ...computeDerivedValues(newResults)
    }
  }),

  setResults: (results) => set({
    results,
    ...computeDerivedValues(results)
  }),

  setScanners: (scanners) => set({ scanners }),

  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

  reset: () => set({
    status: 'idle',
    progress: null,
    results: [],
    error: null,
    _totalFindings: 0,
    _hasFindings: false,
    _successfulScans: 0,
    _failedScans: 0
  })
}))

// Memoized selectors using shallow comparison
export const useTotalFindings = () => useScanStore((state) => state._totalFindings)

export const useHasFindings = () => useScanStore((state) => state._hasFindings)

export const useScanStats = () => useScanStore(
  (state) => ({
    totalFindings: state._totalFindings,
    hasFindings: state._hasFindings,
    successfulScans: state._successfulScans,
    failedScans: state._failedScans,
    totalScans: state.results.length
  }),
  shallow
)

export const useScanProgress = () => useScanStore(
  (state) => ({
    status: state.status,
    progress: state.progress,
    error: state.error
  }),
  shallow
)

// Selector for results with findings only
export const useResultsWithFindings = () => useScanStore(
  (state) => state.results.filter((result) => result.hasFindings)
)
