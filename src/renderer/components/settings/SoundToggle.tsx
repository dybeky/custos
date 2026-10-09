import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isUiSoundEnabled, setUiSoundEnabled } from '../../utils/ui-sound'

/** On/off switch for the menu click sound. */
export function SoundToggle() {
  const { t } = useTranslation()
  const [on, setOn] = useState(isUiSoundEnabled)

  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => {
        setUiSoundEnabled(!on)
        setOn(!on)
      }}
      className="mt-4 w-full flex items-center justify-between gap-4 rounded-xl border border-[color:var(--line)] px-4 py-3 text-left hover:border-[color:var(--line-strong)] transition-colors"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{t('settings.sound.title')}</span>
        <span className="block mt-0.5 text-[11px] text-ink-dim">{t('settings.sound.desc')}</span>
      </span>
      <span className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${on ? 'bg-scan' : 'bg-panel-2 border border-[color:var(--line-strong)]'}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${on ? 'left-5 bg-on-accent' : 'left-1 bg-ink-dim'}`} />
      </span>
    </button>
  )
}
