import { create } from 'zustand'
import { ScanResult, ScanProgress, ScannerInfo, ScanReport } from '../../shared/types'

export type ScanStatus = 'idle' | 'scanning' | 'completed' | 'error'

interface ScanState {
  status: ScanStatus
  progress: ScanProgress | null
  results: ScanResult[]
  scanners: ScannerInfo[]
  error: string | null
  report: ScanReport | null

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
  setReport: (report: ScanReport | null) => void
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
  report: null,

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

  setReport: (report) => set({ report }),

  reset: () => set({
    status: 'idle',
    progress: null,
    results: [],
    error: null,
    report: null,
    _totalFindings: 0,
    _hasFindings: false,
    _successfulScans: 0,
    _failedScans: 0
  })
}))

type ScanEventsApi = Pick<
  Window['electronAPI'],
  'onScanProgress' | 'onScanResult' | 'onScanComplete' | 'onScanReport' | 'onScanError'
>

/**
 * Wire main-process scan events into the store for the app's lifetime.
 *
 * Subscribed once at the app root (not per page) so a scan keeps updating the
 * store while the user browses other pages — otherwise the completion event
 * could fire while nothing is listening and the UI would stay "scanning".
 *
 * Events are applied only while a scan is in progress: after the user cancels
 * (status → idle) the main process still unwinds and emits late results and a
 * final completion, which must not flip the UI back to "completed".
 *
 * @returns an unsubscribe function.
 */
export function subscribeToScanEvents(api: ScanEventsApi = window.electronAPI): () => void {
  const store = useScanStore
  const scanning = (): boolean => store.getState().status === 'scanning'

  const unsubs = [
    api.onScanProgress((progress) => {
      if (scanning()) store.getState().setProgress(progress)
    }),
    api.onScanResult((result) => {
      if (scanning()) store.getState().addResult(result)
    }),
    api.onScanReport((report) => {
      if (scanning()) store.getState().setReport(report)
    }),
    api.onScanComplete((results) => {
      if (!scanning()) return
      store.getState().setResults(results)
      store.getState().setStatus('completed')
    }),
    api.onScanError((error) => {
      if (scanning()) store.getState().setError(error.message)
    })
  ]
  return () => unsubs.forEach((unsub) => unsub())
}
