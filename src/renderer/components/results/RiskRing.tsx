import { motion } from 'framer-motion'
import type { VerdictBand } from '../../../shared/types'
import { bandTone } from '../../utils/results-view'

const R = 54
const CIRC = 2 * Math.PI * R

/** The verdict's risk score as a ring that fills up to the score, coloured by band. */
export function RiskRing({ score, band, label }: { score: number; band: VerdictBand; label: string }) {
  const tone = bandTone(band)
  const pct = Math.max(0, Math.min(100, score)) / 100
  return (
    <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`${label}: ${score}/100`}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" strokeWidth="9" className="stroke-ink/10" />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={tone.stroke}
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC * (1 - pct) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(var(--glow), .45))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display text-4xl font-bold leading-none ${tone.text}`}>{score}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">{label}</span>
      </div>
    </div>
  )
}
