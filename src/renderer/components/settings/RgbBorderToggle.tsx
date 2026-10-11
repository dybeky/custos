import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { isRgbBorderEnabled, setRgbBorderEnabled, subscribeRgbBorder } from '../../utils/rgb-border'

/** On/off switch for the RGB window border. */
export function RgbBorderToggle() {
  const { t } = useTranslation()
  const on = useSyncExternalStore(subscribeRgbBorder, isRgbBorderEnabled)

  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => setRgbBorderEnabled(!on)}
      className="mt-3 w-full flex items-center justify-between gap-4 rounded-xl border border-[color:var(--line)] px-4 py-3 text-left hover:border-[color:var(--line-strong)] transition-colors"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{t('settings.rgbBorder.title')}</span>
        <span className="block mt-0.5 text-[11px] text-ink-dim">{t('settings.rgbBorder.desc')}</span>
      </span>
      <span className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${on ? 'bg-scan' : 'bg-panel-2 border border-[color:var(--line-strong)]'}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${on ? 'left-5 bg-on-accent' : 'left-1 bg-ink-dim'}`} />
      </span>
    </button>
  )
}
