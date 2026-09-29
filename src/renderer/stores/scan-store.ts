import { create } from 'zustand'
import { ScanResult, ScanProgress, ScannerInfo, ScanReport } from '../../shared/types'
import type { GameId } from '../../shared/games'
import { evidenceFindings } from '../utils/report-view'
import { diffReports, findPrevious, scanPlayerLabel, type HistorySummary, type ReportDiff } from '../../shared/history'

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
  /** Evidence (non-informational, active) findings in the analyzed report; null until it arrives. */
  _evidenceCount: number | null
  /** Findings dismissed as false positives in the current scan. */
  dismissedIds: string[]
  /** Signatures ignored on every scan (persisted in main). */
  whitelist: string[]
  /** Who is being checked + checker notes; kept across scans until edited. */
  caseInfo: { player: string; notes: string }
  /** Who is running the checks (optional; kept for the whole session, sent with each check). */
  checker: string
  setChecker: (name: string) => void
  setCaseInfo: (patch: Partial<{ player: string; notes: string }>) => void

  /** Saved checks (newest first). */
  history: HistorySummary[]
  /** The same player's previous check and what changed since, if any. */
  previous: { summary: HistorySummary; diff: ReportDiff } | null
  /** True while a saved check (not the live scan) is displayed — triage is off. */
  viewingHistory: boolean
  loadHistory: () => Promise<void>
  /** Recompute `previous` for the current report + player. */
  refreshPrevious: () => Promise<void>
  openHistory: (id: string) => Promise<boolean>
  deleteHistory: (id: string) => Promise<void>

  // Actions
  setStatus: (status: ScanStatus) => void
  setProgress: (progress: ScanProgress | null) => void
  addResult: (result: ScanResult) => void
  setResults: (results: ScanResult[]) => void
  setScanners: (scanners: ScannerInfo[]) => void
  setError: (error: string | null) => void
  setReport: (report: ScanReport | null) => void
  reset: () => void
  /** Start a full scan (no-op while one is running). */
  startScan: (gameId?: GameId) => Promise<void>
  /** Cancel the running scan; late events from main are then ignored. */
  cancelScan: () => Promise<void>
  /** Load the persisted signature whitelist from main. */
  loadTriage: () => Promise<void>
  dismissFinding: (id: string) => Promise<void>
  restoreFinding: (id: string) => Promise<void>
  ignoreSignature: (signature: string) => Promise<void>
  unignoreSignature: (signature: string) => Promise<void>
}

// Helper to compute derived values
const computeDerivedValues = (results: ScanResult[]) => ({
  _totalFindings: results.reduce((total, result) => total + result.findings.length, 0),
  _hasFindings: results.some((result) => result.hasFindings),
  _successfulScans: results.filter((result) => result.success).length,
  _failedScans: results.filter((result) => !result.success).length
})

let caseSyncTimer: ReturnType<typeof setTimeout> | null = null

/** History IPC exists (false in unit tests that stub only part of the bridge). */
function hasHistoryApi(): boolean {
  const api = (globalThis as { window?: { electronAPI?: Partial<Window['electronAPI']> } }).window?.electronAPI
  return typeof api?.listHistory === 'function' && typeof api?.setHistoryCase === 'function'
}

/**
 * Save player/notes into the displayed check's history entry (debounced), then
 * look again for that player's previous check — the player is what links them.
 */
function scheduleCaseSync(get: () => ScanState, set: (p: Partial<ScanState>) => void): void {
  if (caseSyncTimer) clearTimeout(caseSyncTimer)
  caseSyncTimer = setTimeout(async () => {
    caseSyncTimer = null
    const { report, caseInfo } = get()
    if (!report || !hasHistoryApi()) return
    try {
      set({ history: await window.electronAPI.setHistoryCase(report.id, caseInfo.player, caseInfo.notes) })
    } catch {
      // the check may not be saved yet — the next edit retries
    }
    void get().refreshPrevious()
  }, 600)
}

/**
 * Push new triage choices to main, which re-scores the last scan and persists
 * the whitelist; the returned report replaces the current one.
 */
async function applyTriage(
  get: () => ScanState,
  set: (partial: Partial<ScanState>) => void,
  next: { dismissedIds: string[]; whitelist: string[] }
): Promise<void> {
  set(next)
  const report = await window.electronAPI.reanalyze({
    whitelistedSignatures: next.whitelist,
    dismissedFindingIds: next.dismissedIds
  })
  if (report && get().report?.id === report.id) get().setReport(report)
}

export const useScanStore = create<ScanState>((set, get) => ({
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
  _evidenceCount: null,
  dismissedIds: [],
  whitelist: [],
  caseInfo: { player: '', notes: '' },
  checker: '',
  setChecker: (checker) => set({ checker }),
  setCaseInfo: (patch) => {
    set((state) => ({ caseInfo: { ...state.caseInfo, ...patch } }))
    scheduleCaseSync(get, set)
  },

  history: [],
  previous: null,
  viewingHistory: false,

  loadHistory: async () => {
    try {
      set({ history: await window.electronAPI.listHistory() })
    } catch {
      // history is optional
    }
  },

  refreshPrevious: async () => {
    const { report, caseInfo } = get()
    if (!report) return set({ previous: null })
    try {
      const history = await window.electronAPI.listHistory()
      set({ history })
      const summary = findPrevious(history, report.id, report.meta.scannedAt, caseInfo.player)
      if (!summary) return set({ previous: null })
      const entry = await window.electronAPI.getHistory(summary.id)
      // The report may have changed while we were loading.
      if (!entry || get().report?.id !== report.id) return
      set({ previous: { summary, diff: diffReports(entry.report, get().report!) } })
    } catch {
      set({ previous: null })
    }
  },

  openHistory: async (id) => {
    if (get().status === 'scanning') return false
    const entry = await window.electronAPI.getHistory(id).catch(() => null)
    if (!entry) return false
    set({
      status: 'completed',
      progress: null,
      error: null,
      results: entry.results,
      ...computeDerivedValues(entry.results),
      report: entry.report,
      _evidenceCount: evidenceFindings(entry.report).length,
      dismissedIds: [],
      caseInfo: { ...entry.case },
      viewingHistory: true,
      previous: null
    })
    void get().refreshPrevious()
    return true
  },

  deleteHistory: async (id) => {
    try {
      set({ history: await window.electronAPI.deleteHistory(id) })
    } catch {
      // keep the current list
    }
  },

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

  setReport: (report) => {
    set({ report, _evidenceCount: report ? evidenceFindings(report).length : null })
    if (report && hasHistoryApi()) void get().refreshPrevious()
  },

  reset: () => set({
    status: 'idle',
    progress: null,
    results: [],
    error: null,
    report: null,
    _totalFindings: 0,
    _hasFindings: false,
    _successfulScans: 0,
    _failedScans: 0,
    _evidenceCount: null,
    dismissedIds: [],
    // A new check is a new case: never carry the last player's name over.
    caseInfo: { player: '', notes: '' },
    previous: null,
    viewingHistory: false
  }),

  startScan: async (gameId) => {
    if (get().status === 'scanning') return
    get().reset()
    set({ status: 'scanning' })
    try {
      await window.electronAPI.startScan(undefined, gameId)
    } catch (error) {
      // Ignore a rejection that lands after the user already cancelled.
      if (get().status !== 'scanning') return
      get().setError(error instanceof Error ? error.message : 'Unknown error')
    }
  },

  cancelScan: async () => {
    set({ status: 'idle', progress: null })
    await window.electronAPI.cancelScan().catch(() => {})
  },

  loadTriage: async () => {
    try {
      const { whitelistedSignatures } = await window.electronAPI.getTriage()
      set({ whitelist: whitelistedSignatures })
    } catch {
      // keep the empty default
    }
  },

  dismissFinding: (id) =>
    applyTriage(get, set, { dismissedIds: [...new Set([...get().dismissedIds, id])], whitelist: get().whitelist }),

  restoreFinding: (id) =>
    applyTriage(get, set, { dismissedIds: get().dismissedIds.filter(x => x !== id), whitelist: get().whitelist }),

  ignoreSignature: (signature) => {
    const lower = signature.toLowerCase()
    const whitelist = get().whitelist.some(s => s.toLowerCase() === lower) ? get().whitelist : [...get().whitelist, signature]
    return applyTriage(get, set, { dismissedIds: get().dismissedIds, whitelist })
  },

  unignoreSignature: (signature) => {
    const lower = signature.toLowerCase()
    return applyTriage(get, set, {
      dismissedIds: get().dismissedIds,
      whitelist: get().whitelist.filter(s => s.toLowerCase() !== lower)
    })
  }
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
      if (!scanning()) return
      // The player detected on the PC fills the case (main saved the same
      // label into this check's history entry).
      const { caseInfo } = store.getState()
      if (report.meta.player && !caseInfo.player.trim()) {
        store.setState({ caseInfo: { ...caseInfo, player: scanPlayerLabel(report.meta.player) } })
      }
      store.getState().setReport(report)
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

/**
 * The number to show users as "findings": evidence from the analyzed report
 * once available (excludes system information such as Steam accounts), else
 * the raw count while a scan is still streaming in.
 */
export function shownFindingCount(state: Pick<ScanState, '_evidenceCount' | '_totalFindings'>): number {
  return state._evidenceCount ?? state._totalFindings
}
