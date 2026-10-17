import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isUiSoundEnabled, setUiSoundEnabled } from '../../utils/ui-sound'
import { SwitchRow } from './SettingsParts'

/** The menu click sound switch. */
export function SoundToggle() {
  const { t } = useTranslation()
  const [on, setOn] = useState(isUiSoundEnabled)

  return (
    <div className="space-y-2.5">
      <SwitchRow
        checked={on}
        onChange={(next) => {
          setUiSoundEnabled(next)
          setOn(next)
        }}
        title={t('settings.sound.title')}
        desc={t('settings.sound.desc')}
      />
    </div>
  )
}
