import { useTranslation } from 'react-i18next'
import { useScanStore } from '../../stores/scan-store'

/** Shown while a saved check is displayed: it is read-only and from the past. */
export function HistoryBanner({ onBack }: { onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const { viewingHistory, report } = useScanStore()
  if (!viewingHistory || !report) return null
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.meta.scannedAt))
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-scan/30 bg-scan/[0.06] px-4 py-2.5 text-xs">
      <span className="text-ink">{t('history.viewing', { when })}</span>
      <button onClick={onBack} className="shrink-0 font-medium text-scan hover:underline">{t('history.back')}</button>
    </div>
  )
}
