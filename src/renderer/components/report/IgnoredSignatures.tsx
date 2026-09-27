import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { useScanStore } from '../../stores/scan-store'

/** The persisted signature whitelist, with one-click removal. Hidden when empty. */
export function IgnoredSignatures() {
  const { t } = useTranslation()
  const { whitelist, unignoreSignature } = useScanStore()
  if (whitelist.length === 0) return null

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-bold text-ink font-display">{t('triage.ignoredTitle')}</h3>
          <InfoTip title={t('triage.ignoredTitle')} text={t('triage.ignoredHint')} />
        </div>
        <div className="flex flex-wrap gap-2">
          {whitelist.map((sig) => (
            <span key={sig} className="inline-flex items-center gap-1.5 rounded-lg bg-panel-2 pl-2.5 pr-1 py-1 text-xs font-mono text-ink">
              {sig}
              <button
                onClick={() => void unignoreSignature(sig)}
                aria-label={`${t('triage.remove')} ${sig}`}
                title={t('triage.remove')}
                className="w-5 h-5 rounded-md text-ink-dim hover:text-alert hover:bg-alert/10 flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
