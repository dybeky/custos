import { useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatedBackground } from './components/layout/AnimatedBackground'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Scan } from './pages/Scan'
import { Results } from './pages/Results'
import { Manual } from './pages/Manual'
import { Utilities } from './pages/Utilities'
import { Settings } from './pages/Settings'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './stores/settings-store'
import { VersionInfo, DownloadProgress } from '../shared/types'
import './i18n'

type UpdateState = 'checking' | 'update-required' | 'downloading' | 'ready' | 'error'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + '/s'
}

export function App() {
  const { t } = useTranslation()
  const { loadSettings, isLoading } = useSettingsStore()
  const [updateState, setUpdateState] = useState<UpdateState>('checking')
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl) {
      setError('Download URL not available')
      setUpdateState('error')
      return
    }

    try {
      setError(null) // Clear previous error
      setUpdateState('downloading')
      setDownloadProgress({ percent: 0, transferred: 0, total: updateInfo.fileSize || 0, speed: 0 })
      await window.electronAPI.downloadUpdate(updateInfo.downloadUrl)
    } catch (err) {
      console.error('Download failed:', err)
      setError(err instanceof Error ? err.message : 'Download failed')
      setUpdateState('error')
    }
  }, [updateInfo])

  const handleExit = useCallback(() => {
    window.electronAPI.quit()
  }, [])

  // Check for updates on startup
  useEffect(() => {
    if (isLoading) return

    const { checkUpdatesOnStartup } = useSettingsStore.getState()

    if (!checkUpdatesOnStartup) {
      setUpdateState('ready')
      return
    }

    const checkForUpdates = async () => {
      try {
        setUpdateState('checking')
        const info = await window.electronAPI.checkUpdate()
        setUpdateInfo(info)

        if (info.isUpdateAvailable) {
          setUpdateState('update-required')

          const { autoDownloadUpdates } = useSettingsStore.getState()
          if (autoDownloadUpdates && info.downloadUrl) {
            setTimeout(() => handleUpdate(), 500)
          }
        } else {
          setUpdateState('ready')
        }
      } catch (err) {
        console.error('Failed to check for updates:', err)
        // If we can't check updates, let the user in
        setUpdateState('ready')
      }
    }

    checkForUpdates()
  }, [isLoading, handleUpdate])

  // Listen for download progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress)
    })

    return () => unsubscribe()
  }, [])

  // Loading state
  if (isLoading || updateState === 'checking') {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <AnimatedBackground />
        <div className="text-center relative z-10">
          <span
            className="text-3xl font-bold tracking-wide mb-6 block"
            style={{
              background: 'linear-gradient(90deg, #c6a2e8, #515ef5, #c6a2e8)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradientText 3s ease infinite',
            }}
          >
            custos
          </span>
          <div className="w-8 h-8 border-2 border-aurora-purple border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">{t('startup.checkingForUpdates')}</p>
        </div>
      </div>
    )
  }

  // Update required modal (blocking)
  if (updateState === 'update-required' || updateState === 'downloading' || updateState === 'error') {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <AnimatedBackground />
        <div className="bg-background-surface/90 backdrop-blur-xl border border-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl relative z-10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl theme-active flex items-center justify-center">
              <svg className="w-8 h-8 theme-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-text-primary">{t('startup.updateRequired')}</h2>
            <p className="text-text-secondary mt-2">{t('startup.updateRequiredMessage')}</p>
          </div>

          {/* Version info */}
          <div className="bg-background/50 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{t('update.currentVersion')}</span>
              <span className="text-text-primary font-mono">{updateInfo?.currentVersion}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">{t('update.latestVersion')}</span>
              <span className="text-success font-mono">{updateInfo?.latestVersion}</span>
            </div>
          </div>

          {/* Download progress */}
          {updateState === 'downloading' && downloadProgress && (
            <div className="mb-6">
              {/* Progress bar */}
              <div className="h-3 bg-background rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-aurora-purple to-aurora-blue transition-all duration-300"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>

              {/* Stats */}
              <div className="flex justify-between text-xs text-text-secondary">
                <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                <span>{downloadProgress.speed > 0 ? formatSpeed(downloadProgress.speed) : '...'}</span>
              </div>

              <div className="text-center mt-3">
                <span className="text-2xl font-bold text-text-primary">{Math.round(downloadProgress.percent)}%</span>
              </div>
            </div>
          )}

          {/* Error message */}
          {updateState === 'error' && error && (
            <div className="mb-6 p-4 bg-error/10 border border-error/20 rounded-xl">
              <p className="text-error text-sm text-center">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleExit}
              disabled={updateState === 'downloading'}
              className="flex-1 py-3 px-4 bg-background-elevated hover:bg-white/10 text-text-secondary rounded-xl transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('startup.closeApp')}
            </button>
            {updateState !== 'downloading' && (
              <button
                onClick={handleUpdate}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-aurora-purple to-aurora-blue hover:opacity-90 text-white font-medium rounded-xl transition-all"
              >
                {t('update.update')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Main app (only when ready and no update required)
  return (
    <ErrorBoundary>
      <HashRouter>
        <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden">
          <AnimatedBackground />

          <Header />

          <div className="flex flex-1 overflow-hidden relative z-10">
            <Sidebar />

            <main className="flex-1 overflow-hidden flex flex-col">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/scan" element={<Scan />} />
                <Route path="/results" element={<Results />} />
                <Route path="/manual" element={<Manual />} />
                <Route path="/utilities" element={<Utilities />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </ErrorBoundary>
  )
}
