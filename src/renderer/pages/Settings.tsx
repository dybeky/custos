import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Modal } from '../components/ui/Modal'
import { useSettingsStore } from '../stores/settings-store'

export function Settings() {
  const { t } = useTranslation()
  const {
    checkUpdatesOnStartup,
    autoDownloadUpdates,
    deleteAfterUse,
    setCheckUpdatesOnStartup,
    setAutoDownloadUpdates,
    setDeleteAfterUse
  } = useSettingsStore()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDeleteNow = async () => {
    try {
      await window.electronAPI.deleteSelf()
    } catch (error) {
      console.error('Failed to delete:', error)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">{t('settings.title')}</h1>
          <p className="text-text-secondary mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Updates */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.updates')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Toggle
                checked={checkUpdatesOnStartup}
                onChange={setCheckUpdatesOnStartup}
                label={t('settings.checkOnStartup')}
                description={t('settings.checkOnStartupDesc')}
              />
              <Toggle
                checked={autoDownloadUpdates}
                onChange={setAutoDownloadUpdates}
                label={t('settings.autoDownload')}
                description={t('settings.autoDownloadDesc')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card variant="default" className="border-error/30">
          <CardHeader>
            <CardTitle className="text-error">{t('settings.dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Toggle
                checked={deleteAfterUse}
                onChange={setDeleteAfterUse}
                label={t('settings.deleteAfterUse')}
                description={t('settings.deleteAfterUseDesc')}
              />
              <Button
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t('settings.deleteProgramNow')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('confirm.confirmDeleteTitle')}
        size="sm"
      >
        <p className="text-text-secondary mb-6 whitespace-pre-line">
          {t('confirm.confirmDelete')}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
            {t('settings.back')}
          </Button>
          <Button variant="danger" onClick={handleDeleteNow}>
            {t('settings.deleteProgramNow')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
