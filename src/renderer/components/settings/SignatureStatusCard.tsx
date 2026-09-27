import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SignatureStatus } from '../../../shared/types'

/** Which detection signatures scans use, and a manual "check the site now". */
export function SignatureStatusCard() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<SignatureStatus | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.electronAPI.getSignatureStatus().then(setStatus).catch(() => {})
  }, [])

  if (!status) return null

  const check = async () => {
    setChecking(true)
    try {
      setStatus(await window.electronAPI.checkSignatures())
    } catch {
      // keep the last status
    } finally {
      setChecking(false)
    }
  }

  const when = status.lastCheckedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(status.lastCheckedAt))
    : null

  return (
    <div className="space-y-2 text-sm">
      <p className="text-ink">
        {status.version > 0 ? t('settings.signatures.site', { count: status.entries, version: status.version }) : t('settings.signatures.bundled')}
      </p>
      {!status.enabled ? (
        <p className="text-xs text-ink-dim">{t('settings.signatures.off')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void check()}
            disabled={checking}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-panel-2 text-ink-dim hover:text-ink transition-colors disabled:opacity-50"
          >
            {checking ? t('settings.signatures.checking') : t('settings.signatures.check')}
          </button>
          {when && <span className="text-xs text-ink-dim">{t('settings.signatures.checked', { when })}</span>}
          {status.lastError && <span className="text-xs text-amber">{t('settings.signatures.error', { error: status.lastError })}</span>}
        </div>
      )}
    </div>
  )
}
