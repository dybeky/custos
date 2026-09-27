import { motion } from 'framer-motion'
import type { VerdictBand } from '../../../shared/types'

/** Colour per verdict band (CSS values so SVG strokes can use them). */
export const BAND_COLOR: Record<VerdictBand, string> = {
  clean: '#8FBF9F',
  low: '#c89a6a',
  medium: '#e3a45c',
  high: '#e0604c',
  critical: '#ff4f3a'
}

const R = 80
const ARC = Math.PI * R // half-circle length

/**
 * Half-ring risk gauge: the arc fills to the score in the band's colour, the
 * score sits in the middle. Animates from 0 on mount.
 */
export function VerdictGauge({ score, band, label }: { score: number; band: VerdictBand; label: string }) {
  const color = BAND_COLOR[band]
  const filled = (Math.max(0, Math.min(100, score)) / 100) * ARC
  return (
    <div className="relative w-[200px] h-[112px] mx-auto">
      <svg viewBox="0 0 200 112" className="w-full h-full overflow-visible" aria-hidden="true">
        <path d={`M 20 100 A ${R} ${R} 0 0 1 180 100`} fill="none" stroke="var(--line-strong)" strokeWidth="10" strokeLinecap="round" />
        <motion.path
          d={`M 20 100 A ${R} ${R} 0 0 1 180 100`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={ARC}
          initial={{ strokeDashoffset: ARC }}
          animate={{ strokeDashoffset: ARC - filled }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 10px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-4xl font-semibold tabular-nums tracking-tight text-ink leading-none">{score}</div>
        <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>{label}</div>
      </div>
    </div>
  )
}
