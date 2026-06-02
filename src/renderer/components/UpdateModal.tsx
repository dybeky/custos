import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import type { UpdateInfo } from '../../shared/types'

// Accent color per changelog group — keeps the emoji-free changelog readable.
const ACCENT: Record<string, string> = {
  New: '#FF678B',
  Fixes: '#34D399',
  Performance: '#FFF48D',
  Improvements: '#FFF48D'
}
const ACCENT_DEFAULT = '#FF678B'

export function UpdateModal({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal isOpen onClose={onClose} title={t('update.title')} size="md">
      <p className="text-sm text-ink-dim mb-3">
        {t('update.newVersion', { version: info.latestVersion })}
      </p>
      <div className="space-y-4 max-h-64 overflow-y-auto mb-4">
        {info.notes.map((group) => {
          const accent = ACCENT[group.group] ?? ACCENT_DEFAULT
          return (
            <div key={group.group}>
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="h-3 w-1 rounded-full shrink-0"
                  style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}66` }}
                />
                <h3
                  className="text-2xs font-bold tracking-[0.18em] uppercase font-display"
                  style={{ color: accent }}
                >
                  {group.group}
                </h3>
              </div>
              <ul className="space-y-1 pl-3">
                {group.entries.map((e) => (
                  <li key={e.sha} className="text-sm text-ink flex gap-2.5 items-start">
                    <span
                      className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="leading-snug">{e.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>{t('update.later')}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { if (info.url) window.electronAPI.openExternal(info.url); onClose() }}
        >
          {t('update.download')}
        </Button>
      </div>
    </Modal>
  )
}
