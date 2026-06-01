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
    deleteAfterUse,
    setDeleteAfterUse
  } = useSettingsStore()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDeleteNow = async () => {
    try {
      setDeleteError(null)
      await window.electronAPI.deleteSelf()
    } catch (error) {
      console.error('Failed to delete:', error)
      setDeleteError(error instanceof Error ? error.message : t('settings.deleteError'))
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Appearance — single palette showcase */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.paletteDesc')}</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { hex: '#D3D3FF', name: 'Lavender' },
                { hex: '#CEB5FF', name: 'Purple' },
                { hex: '#8EC1DE', name: 'Sky' },
                { hex: '#80A8FF', name: 'Blue' }
              ].map((c) => (
                <div key={c.hex} className="flex flex-col items-center gap-2">
                  <div
                    className="w-full h-12 rounded-xl border border-[color:var(--line)]"
                    style={{ background: c.hex, boxShadow: `0 0 16px ${c.hex}55` }}
                  />
                  <span className="text-2xs font-mono text-ink-dim">{c.hex}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card variant="default" className="border-alert/30">
          <CardHeader>
            <CardTitle className="text-alert">{t('settings.dangerZone')}</CardTitle>
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
        onClose={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
        title={t('confirm.confirmDeleteTitle')}
        size="sm"
      >
        <p className="text-ink-dim mb-6 whitespace-pre-line">
          {t('confirm.confirmDelete')}
        </p>
        {deleteError && (
          <div className="mb-4 p-3 bg-alert/10 border border-alert/20 rounded-xl">
            <p className="text-alert text-sm text-center">{deleteError}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}>
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
