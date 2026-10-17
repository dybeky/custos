import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isUiSoundEnabled, setUiSoundEnabled } from '../../utils/ui-sound'
import { toggleMusic, useMusicStore } from '../../stores/music-store'
import { SwitchRow } from './SettingsParts'

/** The menu click sound and the launch music: two switches. */
export function SoundToggle() {
  const { t } = useTranslation()
  const [on, setOn] = useState(isUiSoundEnabled)
  const musicEnabled = useMusicStore((s) => s.enabled)
  const musicStatus = useMusicStore((s) => s.status)
  const musicOn = musicEnabled && musicStatus !== 'ended'

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
      <SwitchRow
        checked={musicOn}
        onChange={() => toggleMusic()}
        title={t('settings.music.title')}
        desc={musicStatus === 'ended' ? t('music.replay') : t('settings.music.desc')}
      />
    </div>
  )
}
