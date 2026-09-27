import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { TopBar } from './components/TopBar'
import { CommandPalette } from './components/CommandPalette'
import { CheckPage } from './pages/CheckPage'
import { ToolsPage } from './pages/ToolsPage'
import { HistoryPage } from './pages/HistoryPage'
import { LiveScan } from '../pages/LiveScan'
import { Dashboard } from '../pages/Dashboard'
import { Settings } from '../pages/Settings'
import { Profile } from '../pages/Profile'
import { useScanStore } from '../stores/scan-store'
import { useAppHealthStore } from '../stores/app-health-store'
import { useGameStore } from '../stores/game-store'
import { useExportReport } from './commands'

/**
 * The modern ("Focus") interface: one top bar, a single check workspace, and
 * a keyboard-first layer — Ctrl+K palette, Ctrl+Enter to scan, Ctrl+E to
 * export. Shares every store and page with the classic UI.
 */
export function ModernShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()
  const exportReport = useExportReport()

  // The classic Header initializes OS/capability info; the modern shell has
  // no Header, so do it here (idempotent).
  useEffect(() => {
    void useAppHealthStore.getState().initialize()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (key === 'enter') {
        const { status, startScan } = useScanStore.getState()
        if (status === 'scanning') return
        e.preventDefault()
        navigate('/')
        void startScan(useGameStore.getState().selectedGame ?? undefined)
      } else if (key === 'e') {
        if (exportReport('txt')) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, exportReport])

  return (
    <div className="ui-modern h-screen w-screen bg-bg text-ink flex flex-col overflow-hidden">
      <TopBar onOpenPalette={() => setPaletteOpen(true)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<CheckPage />} />
          <Route path="/live" element={<LiveScan />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/system" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
