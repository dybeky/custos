import { useTranslation } from 'react-i18next'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import type { UpdateInfo } from '../../shared/types'

export function UpdateModal({ info, onClose }: { info: UpdateInfo; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal isOpen onClose={onClose} title={t('update.title')} size="md">
      <p className="text-sm text-ink-dim mb-3">
        {t('update.newVersion', { version: info.latestVersion })}
      </p>
      <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
        {info.notes.map((group) => (
          <div key={group.group}>
            <h3 className="text-2xs font-bold tracking-[0.18em] uppercase text-ink-dim font-display mb-1">
              {group.emoji} {group.group}
            </h3>
            <ul className="space-y-1">
              {group.entries.map((e) => (
                <li key={e.sha} className="text-sm text-ink flex gap-2">
                  <span className="text-scan">•</span><span>{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
