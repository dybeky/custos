import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { AnimatedBackground } from './components/layout/AnimatedBackground'
import { Dashboard } from './pages/Dashboard'
import { Scan } from './pages/Scan'
import { Results } from './pages/Results'
import { Manual } from './pages/Manual'
import { Utilities } from './pages/Utilities'
import { Settings } from './pages/Settings'
import { LiveScan } from './pages/LiveScan'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './stores/settings-store'
import { GamePicker } from './components/GamePicker'
import { UpdateModal } from './components/UpdateModal'
import { WebsitePromoToast } from './components/WebsitePromoToast'
import { UpdateCheckFailedToast } from './components/UpdateCheckFailedToast'
import { useGameStore } from './stores/game-store'
import type { UpdateInfo } from '../shared/types'
import './i18n'

export function App() {
  const { loadSettings, isLoading } = useSettingsStore()
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

  // Brief loading screen while settings load
  if (isLoading) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen bg-background flex items-center justify-center">
          <div className="text-center relative z-10">
            <span
              className="text-3xl font-bold tracking-wide mb-6 block"
              style={{
                background: 'linear-gradient(90deg, #C8A47E, #EDE7DE)',
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

  return (
    <ErrorBoundary>
      <HashRouter>
        <div className="h-screen w-screen bg-background text-text-primary flex flex-col overflow-hidden relative">
          <AnimatedBackground />
          <GamePicker />
          {update && <UpdateModal info={update} onClose={() => setUpdate(null)} />}
          {checkFailed && <UpdateCheckFailedToast onDone={() => setCheckFailed(false)} />}
          {showPromo && <WebsitePromoToast onDone={() => setPromoDone(true)} />}
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
                <Route path="/manual" element={<Manual />} />
                <Route path="/utilities" element={<Utilities />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
          </div>
        </div>
      </HashRouter>
    </ErrorBoundary>
  )
}
