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

export const useSiteSync = create<SiteSyncState>((set, get) => ({
  reportId: null,
  uploading: false,
  result: null,

  upload: async () => {
    const { report, caseInfo } = useScanStore.getState()
    if (!report || get().uploading) return
    const reportId = report.id
    set({ reportId, uploading: true, ...(get().reportId === reportId ? {} : { result: null }) })
    let result: SiteUploadResult
    try {
      result = await window.electronAPI.uploadCheckToSite(reportId, caseInfo.player, caseInfo.notes)
    } catch {
      result = { ok: false, error: 'failed' }
    }
    // The checker may have moved on to another check meanwhile.
    if (get().reportId === reportId) set({ uploading: false, result })
  }
}))

function canUpload(): boolean {
  const { status, capabilities, updateRequired } = useAuthStore.getState()
  return status === 'authed' && !updateRequired && capabilities.includes('upload_reports')
}

/**
 * Every finished check goes to the site on its own when the checker is signed
 * in with upload rights — right after the scan, or after signing in later.
 * Checks reopened from history are left alone (they were synced when made).
 * Once uploaded, edits to the player, notes or triage are re-sent.
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
      if (report && sync.reportId === report.id && sync.result?.ok && canUpload()) void sync.upload()
    }, RESYNC_DELAY_MS)
  }

  const unsubScan = useScanStore.subscribe((state, prev) => {
    const sync = useSiteSync.getState()
    if (state.report?.id !== sync.reportId && (sync.reportId || sync.result)) {
      // Another check on screen: forget the previous one's upload state.
      if (resyncTimer) clearTimeout(resyncTimer)
      useSiteSync.setState({ reportId: null, uploading: false, result: null })
    }
    if (state.status !== prev.status || state.report?.id !== prev.report?.id) trySync()
    else if (state.report && state.report.id === sync.reportId && (state.caseInfo !== prev.caseInfo || state.report !== prev.report)) {
      scheduleResync()
    }
  })
  const unsubAuth = useAuthStore.subscribe((state, prev) => {
    if (state.status !== prev.status || state.capabilities !== prev.capabilities) trySync()
  })
  trySync()
  return () => {
    unsubScan()
    unsubAuth()
    if (resyncTimer) clearTimeout(resyncTimer)
  }
}
