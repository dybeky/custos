import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useScanStore } from '../../stores/scan-store'
import { IdleHero } from '../components/IdleHero'
import { ScanProgress } from '../components/ScanProgress'
import { ResultsWorkspace } from '../components/ResultsWorkspace'

/**
 * The whole check on one screen, morphing with the scan: start → live
 * progress → results workspace. No page hopping between Scan and Results.
 */
export function CheckPage() {
  const { status, report, setScanners } = useScanStore()

  useEffect(() => {
    window.electronAPI.getScanners().then(setScanners).catch(() => {})
  }, [setScanners])

  const view = status === 'scanning' ? 'scanning' : report && status === 'completed' ? 'results' : 'idle'

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 m-grid-bg pointer-events-none" aria-hidden="true" />
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          className="relative h-full"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
        >
          {view === 'scanning' && <ScanProgress />}
          {view === 'results' && report && <ResultsWorkspace report={report} />}
          {view === 'idle' && <IdleHero />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
