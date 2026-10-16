import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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

  const toggle = (): void => {
    const next = !on
    setOn(next)
    window.electronAPI.setSettings({ sendErrorReports: next }).catch(() => setOn(!next))
  }

  return (
    <div>
      <button
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className="w-full flex items-center justify-between gap-4 rounded-xl border border-[color:var(--line)] px-4 py-3 text-left hover:border-[color:var(--line-strong)] transition-colors"
      >
        <span>
          <span className="block text-sm font-medium text-ink">{t('settings.errorReports.toggle')}</span>
          <span className="block mt-0.5 text-[11px] text-ink-dim">{t('settings.errorReports.desc')}</span>
        </span>
        <span
          className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${on ? 'bg-scan' : 'bg-panel-2 border border-[color:var(--line-strong)]'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full transition-all ${on ? 'left-5 bg-on-accent' : 'left-1 bg-ink-dim'}`}
          />
        </span>
      </button>
      <p className="mt-3 text-[11px] text-ink-dim">{t('settings.errorReports.details')}</p>
    </div>
  )
}
