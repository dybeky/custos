import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SiteCheck } from '../../../shared/types'
import { useAuthStore } from '../../stores/auth-store'
import { useScanStore } from '../../stores/scan-store'
import { useSiteSync } from '../../stores/site-sync'
import { bandChipClass } from '../../utils/report-view'

const BTN = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50'

/**
 * The check's link to the site, for signed-in staff: the check is uploaded on
 * its own when the scan finishes (see site-sync), and this shows how that went
 * and — for signed-in staff with the right — this player's checks by every
 * checker. Sending needs no account; the site re-checks every call regardless.
 */
export function SitePanel() {
  const { t, i18n } = useTranslation()
  const { status, capabilities, updateRequired } = useAuthStore()
  const { report, caseInfo } = useScanStore()
  const { reportId: syncedId, uploading: syncing, result, upload: doUpload } = useSiteSync()
  const [checks, setChecks] = useState<SiteCheck[] | null>(null)
  const [checksError, setChecksError] = useState('')
  const [loadingChecks, setLoadingChecks] = useState(false)

  // A different player invalidates the checks shown.
  useEffect(() => { setChecks(null); setChecksError('') }, [caseInfo.player])

  if (!report) return null
  // Sending a check needs no account; browsing the site's checks does.
  const canView = status === 'authed' && capabilities.includes('view_reports')

  const errorText = (code?: string) =>
    t(`site.errors.${code ?? 'failed'}`, { defaultValue: t('site.errors.failed') })

  const upload = syncedId === report.id ? result : null
  const uploading = syncedId === report.id && syncing

  const loadChecks = async () => {
    setLoadingChecks(true)
    setChecksError('')
    try {
      const res = await window.electronAPI.getSitePlayerChecks(caseInfo.player)
      // The site's list includes this very check once uploaded; show the others.
      if (res.ok) setChecks((res.checks ?? []).filter((c) => c.scannedAt !== report.meta.scannedAt))
      else setChecksError(errorText(res.error))
    } catch {
      setChecksError(errorText())
    } finally {
      setLoadingChecks(false)
    }
  }

  const fmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })
  const uploadedId = upload?.ok && upload.url ? upload.url.split('/').pop() : null

  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-panel p-5 mb-6">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{t('site.title')}</p>

      {updateRequired ? (
        <p className="mt-2 text-xs text-amber">{t('site.updateRequired', { version: updateRequired })}</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => void doUpload()} disabled={uploading} className={`${BTN} bg-scan/15 text-scan hover:bg-scan/25`}>
              {uploading ? t('site.uploading') : upload?.ok ? t('site.reupload') : t('site.upload')}
            </button>
            {upload?.ok && (
              <>
                <span className={`text-xs ${upload.hashVerified ? 'text-scan' : 'text-amber'}`}>
                  {upload.hashVerified ? t('site.uploadedIntact') : t('site.uploadedUnverified')}
                </span>
                {uploadedId && canView && (
                  <button onClick={() => void window.electronAPI.openOnSite({ checkId: uploadedId })} className="text-xs text-scan hover:underline">
                    {t('site.openCheck')}
                  </button>
                )}
              </>
            )}
            {upload && !upload.ok && <span className="text-xs text-alert">{errorText(upload.error)}</span>}
          </div>
          {!caseInfo.player.trim() && (
            <p className="mt-1.5 text-[11px] text-ink-dim">{t('site.addPlayerHint')}</p>
          )}

          {canView && caseInfo.player.trim() && (
            <div className="mt-3">
              {checks === null ? (
                <button onClick={() => void loadChecks()} disabled={loadingChecks} className={`${BTN} bg-panel-2 text-ink-dim hover:text-ink`}>
                  {loadingChecks ? t('site.loading') : t('site.playerHistory')}
                </button>
              ) : checks.length === 0 ? (
                <p className="text-xs text-ink-dim">{t('site.noOtherChecks')}</p>
              ) : (
                <>
                  <p className="text-xs text-ink-dim">{t('site.otherChecks', { count: checks.length })}</p>
                  <ul className="mt-1.5 space-y-1">
                    {checks.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => void window.electronAPI.openOnSite({ checkId: c.id })}
                          className="w-full flex items-center gap-2 rounded-lg bg-panel-2 px-2.5 py-1.5 text-left text-xs hover:bg-panel-2/70"
                        >
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${bandChipClass(c.band)}`}>{t(`verdict.band.${c.band}`)}</span>
                          <span className="text-ink">{fmt.format(new Date(c.scannedAt))}</span>
                          <span className="ml-auto truncate text-ink-dim">{c.uploader ?? '—'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {checks !== null && (
                <button onClick={() => void window.electronAPI.openOnSite({ player: caseInfo.player })} className="mt-2 text-xs text-scan hover:underline">
                  {t('site.openPlayer')}
                </button>
              )}
              {checksError && <p className="mt-1.5 text-xs text-alert">{checksError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
