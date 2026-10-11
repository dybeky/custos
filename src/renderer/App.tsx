import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { AnimatedBackground } from './components/layout/AnimatedBackground'
import { LaunchSplash, SPLASH_MIN_MS } from './components/layout/LaunchSplash'
import { AnimatePresence } from 'framer-motion'
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
import { startSiteSync } from './stores/site-sync'
import { GamePicker } from './components/GamePicker'
import { UpdateModal } from './components/UpdateModal'
import { UpdateCheckFailedToast } from './components/UpdateCheckFailedToast'
import { useGameStore } from './stores/game-store'
import type { UpdateInfo } from '../shared/types'
import './i18n'

export function App() {
  const { loadSettings, isLoading } = useSettingsStore()
  const { selectedGame } = useGameStore()
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  // The dialog opens once per session; "Later" only hides it. The header pill
  // brings it back — updating is always the user's choice.
  const [updateOpen, setUpdateOpen] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  // The launch intro plays once, and leaves only when the app is ready too.
  const [introDone, setIntroDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setIntroDone(true), SPLASH_MIN_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!selectedGame) return
    window.electronAPI.checkForUpdate()
      .then((info) => {
        if (info.updateAvailable) {
          setUpdate(info)
          setUpdateOpen(true)
        }
        else if (info.checkFailed) setCheckFailed(true)
      })
      .catch(() => {})
  }, [selectedGame])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Keep the scan store in sync with main for the whole session, independent
  // of which page is mounted.
  useEffect(() => subscribeToScanEvents(), [])

  // Finished checks go to the site on their own for signed-in staff.
  useEffect(() => startSiteSync(), [])

  // Persisted signature whitelist, so triage state shows on the first scan.
  useEffect(() => {
    void useScanStore.getState().loadTriage()
  }, [])

  // Hydrate renderer auth-store from main and stay live via onAuthChanged.
  // No blocking gate — login is optional (PR-1); the scanner works while anon.
  useEffect(() => {
    useAuthStore.getState().init()
  }, [])

  return (
    <ErrorBoundary>
      <AnimatePresence>{(isLoading || !introDone) && <LaunchSplash key="splash" />}</AnimatePresence>
      {!isLoading && (
        <HashRouter>
          <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden relative">
            <AnimatedBackground />
            <GamePicker />
            {update && updateOpen && <UpdateModal info={update} onClose={() => setUpdateOpen(false)} />}
            {checkFailed && <UpdateCheckFailedToast onDone={() => setCheckFailed(false)} />}
            <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
              <Header updateVersion={update?.latestVersion} onUpdateClick={() => setUpdateOpen(true)} />
  
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
        </HashRouter>
      )}
    </ErrorBoundary>
  )
}
