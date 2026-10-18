import { useTranslation } from 'react-i18next'
import { SwitchRow } from './SettingsParts'

/**
 * Errors and crashes always go to the site so they can be fixed: the switch is
 * shown on and locked. The description says what is sent and what never is.
 */
export function ErrorReportsToggle() {
  const { t } = useTranslation()
  return (
    <div>
      <SwitchRow checked disabled onChange={() => {}} title={t('settings.errorReports.toggle')} desc={t('settings.errorReports.desc')} />
      <p className="mt-3 rounded-lg bg-panel-2/50 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
        {t('settings.errorReports.details')}
      </p>
    </div>
  )
}
