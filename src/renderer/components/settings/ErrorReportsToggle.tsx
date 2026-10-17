import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SwitchRow } from './SettingsParts'

/**
 * On/off switch for sending errors and crashes to the site. Custos keeps
 * nothing on the PC, so the choice lasts until the program is closed; the
 * description says what is sent and how to turn it off for good.
 */
export function ErrorReportsToggle() {
  const { t } = useTranslation()
  const [on, setOn] = useState(true)

  useEffect(() => {
    let alive = true
    window.electronAPI
      .getSettings()
      .then((s) => alive && setOn(s.sendErrorReports !== false))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const toggle = (next: boolean): void => {
    setOn(next)
    window.electronAPI.setSettings({ sendErrorReports: next }).catch(() => setOn(!next))
  }

  return (
    <div>
      <SwitchRow
        checked={on}
        onChange={toggle}
        title={t('settings.errorReports.toggle')}
        desc={t('settings.errorReports.desc')}
      />
      <p className="mt-3 rounded-lg bg-panel-2/50 px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
        {t('settings.errorReports.details')}
      </p>
    </div>
  )
}
