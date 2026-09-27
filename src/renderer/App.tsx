import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ModernShell } from './modern/ModernShell'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { AnimatedBackground } from './components/layout/AnimatedBackground'
import { Dashboard } from './pages/Dashboard'
import { Scan } from './pages/Scan'
import { Results } from './pages/Results'
import { History } from './pages/History'
import { Manual } from './pages/Manual'
import { Utilities } from './pages/Utilities'
import { Settings } from './pages/Settings'
import { Profile } from './pages/Profile'
import { LiveScan } from './pages/LiveScan'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './stores/settings-store'
import { useAuthStore } from './stores/auth-store'
import { subscribeToScanEvents, useScanStore } from './stores/scan-store'
import { GamePicker } from './components/GamePicker'
import { UpdateModal } from './components/UpdateModal'
import { WebsitePromoToast } from './components/WebsitePromoToast'
import { UpdateCheckFailedToast } from './components/UpdateCheckFailedToast'
import { useGameStore } from './stores/game-store'
import type { UpdateInfo } from '../shared/types'
import './i18n'

export function App() {
  const { loadSettings, isLoading, uiMode } = useSettingsStore()
  const { selectedGame } = useGameStore()
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checkFailed, setCheckFailed] = useState(false)
  const [promoDone, setPromoDone] = useState(false)
  const [updateChecked, setUpdateChecked] = useState(false)
  const showPromo = !!selectedGame && updateChecked && update === null && !checkFailed && !promoDone

  useEffect(() => {
    if (!selectedGame) return
    window.electronAPI.checkForUpdate()
      .then((info) => {
        if (info.updateAvailable) setUpdate(info)
        else if (info.checkFailed) setCheckFailed(true)
      })
      .catch(() => {})
      .finally(() => setUpdateChecked(true))
  }, [selectedGame])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Keep the scan store in sync with main for the whole session, independent
  // of which page is mounted.
  useEffect(() => subscribeToScanEvents(), [])

  // Persisted signature whitelist, so triage state shows on the first scan.
  useEffect(() => {
    void useScanStore.getState().loadTriage()
  }, [])

  // Hydrate renderer auth-store from main and stay live via onAuthChanged.
  // No blocking gate — login is optional (PR-1); the scanner works while anon.
  useEffect(() => {
    useAuthStore.getState().init()
  }, [])

  // Brief loading screen while settings load
  if (isLoading) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen bg-background flex items-center justify-center">
          <div className="text-center relative z-10">
            <span
              className="text-3xl font-bold tracking-wide mb-6 block"
              style={{
                background: 'linear-gradient(90deg, var(--scan), var(--ink))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              custos
            </span>
            <div className="w-8 h-8 border-2 border-aurora-purple border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  const overlays = (
    <>
      <GamePicker />
      {update && <UpdateModal info={update} onClose={() => setUpdate(null)} />}
      {checkFailed && <UpdateCheckFailedToast onDone={() => setCheckFailed(false)} />}
      {showPromo && <WebsitePromoToast onDone={() => setPromoDone(true)} />}
    </>
  )

  return (
    <ErrorBoundary>
      <HashRouter>
        {uiMode === 'modern' ? (
          <>
            <ModernShell />
            {overlays}
          </>
        ) : (
          <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden relative">
            <AnimatedBackground />
            {overlays}
            <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
            <Header />

            <div className="flex flex-1 overflow-hidden relative z-10">
              <Sidebar />

              <main className="flex-1 overflow-hidden flex flex-col">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/scan" element={<Scan />} />
                  <Route path="/live" element={<LiveScan />} />
                  <Route path="/results" element={<Results />} />
                  <Route path="/history" element={<History />} />
                  <Route path="/manual" element={<Manual />} />
                  <Route path="/utilities" element={<Utilities />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
            </div>
          </div>
        )}
      </HashRouter>
    </ErrorBoundary>
  )
}
