import { useTranslation } from 'react-i18next'
import type { HistorySummary } from '../../../shared/history'
import type { VerdictBand } from '../../../shared/types'
import { dateLocale } from '../../utils/date-locale'

const BAND_TEXT: Record<VerdictBand, string> = {
  critical: 'text-alert',
  high: 'text-alert',
  medium: 'text-amber-500',
  low: 'text-scan',
  clean: 'text-scan'
}

const W = 520
const H = 96
const PAD = 14

/**
 * The verdict score over a player's checks, oldest on the left: one dot per
 * check, coloured by its band. A drop after a bad check often means cleaning.
 */
export function ScoreTrend({ checks }: { checks: HistorySummary[] }) {
  const { t, i18n } = useTranslation()
  if (checks.length === 0) return null
  const fmt = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' })
  const x = (i: number) =>
    checks.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (checks.length - 1)
  const y = (score: number) =>
    PAD + ((100 - Math.max(0, Math.min(100, score))) * (H - 2 * PAD)) / 100
  const points = checks.map((c, i) => `${x(i)},${y(c.score)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-24"
      role="img"
      aria-label={t('casefile.trendTitle')}
    >
      <line
        x1={PAD}
        x2={W - PAD}
        y1={H - PAD}
        y2={H - PAD}
        className="stroke-ink-dim/20"
        strokeWidth={1}
      />
      {checks.length > 1 && (
        <polyline
          points={points}
          fill="none"
          className="stroke-ink-dim/40"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
      {checks.map((c, i) => (
        <g key={c.id} className={BAND_TEXT[c.band]}>
          <circle cx={x(i)} cy={y(c.score)} r={6} fill="currentColor">
            <title>{`${fmt.format(new Date(c.scannedAt))} · ${t(`verdict.band.${c.band}`)} (${c.score})`}</title>
          </circle>
        </g>
      ))}
    </svg>
  )
}
