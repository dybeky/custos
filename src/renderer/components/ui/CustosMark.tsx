import { motion } from 'framer-motion'
import { useId } from 'react'

/**
 * The Custos sword. `draw` traces the strokes in (launch animation); without
 * it the mark is drawn at once.
 */
export function CustosMark({ className = 'w-6 h-6', draw = false, delay = 0 }: { className?: string; draw?: boolean; delay?: number }) {
  const gradient = `custos-mark-${useId().replace(/:/g, '')}`
  const stroke = `url(#${gradient})`
  const part = (i: number) =>
    draw
      ? {
          initial: { pathLength: 0, opacity: 0 },
          animate: { pathLength: 1, opacity: 1 },
          transition: { duration: 0.55, delay: delay + i * 0.12, ease: [0.65, 0, 0.35, 1] as const }
        }
      : {}

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="var(--ink)" />
          <stop offset="55%" stopColor="var(--scan)" />
          <stop offset="100%" stopColor="var(--scan-2)" />
        </linearGradient>
      </defs>
      <motion.path d="M12 2.5l1.6 3.4v7.3h-3.2V5.9L12 2.5z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" {...part(0)} />
      <motion.path d="M7.4 14.2h9.2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" {...part(1)} />
      <motion.path d="M12 14.2v4.2" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" {...part(2)} />
      <motion.circle cx="12" cy="20" r="1.4" stroke={stroke} strokeWidth="1.6" {...part(3)} />
    </svg>
  )
}
