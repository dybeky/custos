import { create } from 'zustand'
import type { SiteUploadResult } from '../../shared/types'
import { useAuthStore } from './auth-store'
import { useScanStore } from './scan-store'

/** Upload state of the check on screen. */
interface SiteSyncState {
  /** The check the state below belongs to. */
  reportId: string | null
  uploading: boolean
  result: SiteUploadResult | null
  /** Upload the check on screen now (the panel's button; also used by the auto-sync). */
  upload: () => Promise<void>
}

// Case edits and triage re-scores after the first upload are sent once the
// checker pauses; the site keeps one row per check, so this updates it.
const RESYNC_DELAY_MS = 4000
let resyncTimer: ReturnType<typeof setTimeout> | null = null

// A send that failed for a passing reason (no network, site busy) is retried
// on its own, backing off; a refusal that won't change by waiting is not.
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000]
const PERMANENT_ERRORS = new Set([
  'invalid_report', 'invalid_request', 'invalid_payload', 'too_large', 'update_required',
  'disabled', 'not_found', 'forbidden', 'not_signed_in'
])
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
// An edit made while a send is in flight is sent right after it, not dropped.
let resendQueued = false

function clearTimers(): void {
  if (resyncTimer) clearTimeout(resyncTimer)
  if (retryTimer) clearTimeout(retryTimer)
  resyncTimer = retryTimer = null
  retryAttempt = 0
  resendQueued = false
}

export const useSiteSync = create<SiteSyncState>((set, get) => ({
  reportId: null,
  uploading: false,
  result: null,

  upload: async () => {
    const { report, caseInfo, checker } = useScanStore.getState()
    if (!report) return
    if (get().uploading) {
      if (get().reportId === report.id) resendQueued = true
      return
    }
    const reportId = report.id
    set({ reportId, uploading: true, ...(get().reportId === reportId ? {} : { result: null }) })
    let result: SiteUploadResult
    try {
      // An empty checker field falls back to the signed-in account name, if any.
      const name = checker.trim() || useAuthStore.getState().user?.username || ''
      result = await window.electronAPI.uploadCheckToSite(reportId, caseInfo.player, caseInfo.notes, name)
    } catch {
      result = { ok: false, error: 'failed' }
    }
    // The checker may have moved on to another check meanwhile.
    if (get().reportId !== reportId) return
    set({ uploading: false, result })
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (result.ok) {
      retryAttempt = 0
      if (resendQueued) {
        resendQueued = false
        void get().upload()
      }
    } else if (!PERMANENT_ERRORS.has(result.error ?? '') && retryAttempt < RETRY_DELAYS_MS.length) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (useScanStore.getState().report?.id === reportId && canUpload()) void get().upload()
      }, RETRY_DELAYS_MS[retryAttempt++])
    }
  }
}))

// Sending needs no account — only an app version the site still accepts.
function canUpload(): boolean {
  return !useAuthStore.getState().updateRequired
}

/**
 * Every finished check goes to the site on its own, signed in or not: what
 * matters is who was checked.
 * Checks reopened from history are left alone (they were synced when made).
 * Once uploaded, edits to the player, notes or triage are re-sent; a send that
 * failed for a passing reason is retried with backoff.
 *
 * @returns an unsubscribe function.
 */
export function startSiteSync(): () => void {
  const trySync = (): void => {
    const scan = useScanStore.getState()
    const sync = useSiteSync.getState()
    if (scan.status !== 'completed' || !scan.report || scan.viewingHistory || !canUpload()) return
    if (sync.reportId === scan.report.id && (sync.uploading || sync.result)) return
    void sync.upload()
  }

  const scheduleResync = (): void => {
    if (resyncTimer) clearTimeout(resyncTimer)
    resyncTimer = setTimeout(() => {
      resyncTimer = null
      const { report } = useScanStore.getState()
      const sync = useSiteSync.getState()
      // Sent before, or being sent now (then upload() queues this edit).
      if (report && sync.reportId === report.id && (sync.result?.ok || sync.uploading) && canUpload()) void sync.upload()
    }, RESYNC_DELAY_MS)
  }

  const unsubScan = useScanStore.subscribe((state, prev) => {
    const sync = useSiteSync.getState()
    if (state.report?.id !== sync.reportId && (sync.reportId || sync.result)) {
      // Another check on screen: forget the previous one's upload state.
      clearTimers()
      useSiteSync.setState({ reportId: null, uploading: false, result: null })
    }
    if (state.status !== prev.status || state.report?.id !== prev.report?.id) trySync()
    else if (state.report && state.report.id === sync.reportId && (state.caseInfo !== prev.caseInfo || state.checker !== prev.checker || state.report !== prev.report)) {
      scheduleResync()
    }
  })
  const unsubAuth = useAuthStore.subscribe((state, prev) => {
    if (state.updateRequired !== prev.updateRequired) trySync()
  })
  trySync()
  return () => {
    unsubScan()
    unsubAuth()
    clearTimers()
  }
}
