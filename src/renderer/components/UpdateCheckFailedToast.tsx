import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'

const DURATION_MS = 6000

export function UpdateCheckFailedToast({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), DURATION_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence onExitComplete={onDone}>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 40, y: 10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="fixed bottom-4 right-4 z-[60] w-72 rounded-xl bg-panel border border-[color:var(--line-strong)] shadow-lg overflow-hidden"
        >
          <div className="p-3 flex items-start justify-between gap-2">
            <p className="text-xs text-ink-dim">{t('update.checkFailed')}</p>
            <button onClick={() => setOpen(false)} aria-label={t('general.dismiss')} className="text-ink-dim hover:text-ink">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
