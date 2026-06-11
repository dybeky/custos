import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'

const TOOLTIP_WIDTH = 280
const VIEWPORT_MARGIN = 8

interface InfoTipProps {
  /** Tooltip body — the explanation shown on hover/focus. */
  text: string
  /** Optional bold first line (e.g. the feature name). */
  title?: string
  className?: string
}

/**
 * Small info icon that reveals a localized explanation when hovered or
 * focused. Rendered through a portal so it escapes overflow-hidden cards.
 */
export function InfoTip({ text, title, className = '' }: InfoTipProps) {
  const { t } = useTranslation()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const show = () => {
    if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect())
  }
  const hide = () => setRect(null)

  // The position is captured once on open, so close on scroll/resize rather
  // than leave the tooltip floating at stale viewport coordinates.
  useEffect(() => {
    if (!rect) return
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [rect])

  if (!text) return null

  // Center horizontally on the icon, clamped to the viewport; render above the
  // icon only when it sits in the lower half, so the tooltip always has at
  // least half the viewport to grow into.
  let style: React.CSSProperties | undefined
  if (rect) {
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, VIEWPORT_MARGIN),
      window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN
    )
    const preferAbove = rect.top > window.innerHeight / 2
    style = {
      zIndex: 99999,
      left,
      width: TOOLTIP_WIDTH,
      ...(preferAbove
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 })
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={title ? `${t('general.moreInfo')}: ${title}` : t('general.moreInfo')}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center shrink-0 rounded-full text-ink-dim/70 hover:text-scan focus-visible:text-scan transition-colors cursor-help outline-none ${className}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {rect && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed px-3.5 py-3 rounded-xl bg-panel-2 border border-[color:var(--line-strong)] shadow-lg pointer-events-none"
              style={style}
            >
              {title && (
                <p className="text-xs font-semibold text-ink font-display mb-1">{title}</p>
              )}
              <p className="text-xs text-ink-dim leading-relaxed">{text}</p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
