import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Toggle } from '../components/ui/Toggle'
import { Modal } from '../components/ui/Modal'
import { useSettingsStore, ThemeName } from '../stores/settings-store'

const themes: { id: ThemeName; name: string; colors: string[]; description: string }[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    colors: ['#ffa1c3', '#d770ff', '#320d40'],
    description: 'Pink & purple glow'
  },
  {
    id: 'mono',
    name: 'Monochrome',
    colors: ['#ffffff', '#242424', '#d64f66'],
    description: 'Dark with red accent'
  },
  {
    id: 'tropical',
    name: 'Tropical',
    colors: ['#76a6f5', '#c0ed85', '#fad098'],
    description: 'Fresh tropical vibes'
  }
]

export function Settings() {
  const { t } = useTranslation()
  const {
    checkUpdatesOnStartup,
    autoDownloadUpdates,
    deleteAfterUse,
    theme,
    setCheckUpdatesOnStartup,
    setAutoDownloadUpdates,
    setDeleteAfterUse,
    setTheme
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
          <h1 className="text-2xl font-bold text-text-primary">{t('settings.title')}</h1>
          <p className="text-text-secondary mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Theme Selection */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.theme')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all duration-300 ${
                    theme === t.id
                      ? 'theme-active scale-[1.02]'
                      : 'border-border hover:border-border-hover bg-background-surface/50 hover:bg-background-elevated/50'
                  }`}
                >
                  {/* Color preview */}
                  <div className="flex gap-1.5 mb-3 justify-center">
                    {t.colors.map((color, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-full"
                        style={{
                          background: color,
                          boxShadow: `0 0 10px ${color}80`
                        }}
                      />
                    ))}
                  </div>

                  {/* Theme name */}
                  <div className="text-sm font-medium text-text-primary">{t.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">{t.description}</div>

                  {/* Active indicator */}
                  {theme === t.id && (
                    <div className="absolute top-2 right-2">
                      <svg className="w-5 h-5 theme-text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

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
        onClose={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
        title={t('confirm.confirmDeleteTitle')}
        size="sm"
      >
        <p className="text-text-secondary mb-6 whitespace-pre-line">
          {t('confirm.confirmDelete')}
        </p>
        {deleteError && (
          <div className="mb-4 p-3 bg-error/10 border border-error/20 rounded-xl">
            <p className="text-error text-sm text-center">{deleteError}</p>
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
