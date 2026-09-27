import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useScanStore, shownFindingCount } from '../../stores/scan-store'
import { SCANNER_DISPLAY_TO_ID } from '../../../shared/scanners-meta'
import { featureName } from '../../utils/feature-i18n'
import { IconCheck, IconStop, IconX } from '../icons'

const R = 64
const C = 2 * Math.PI * R

/**
 * Live view of a running scan: a progress ring with the overall percentage
 * and a grid of every check — waiting, running, done (with its lead count)
 * or failed — updating as results stream in.
 */
export function ScanProgress() {
  const { t } = useTranslation()
  const { scanners, results, progress, cancelScan, _totalFindings, _evidenceCount } = useScanStore()
  const done = results.length
  const total = Math.max(scanners.length, 1)
  const pct = Math.min(100, Math.round((done / total) * 100))
  const leads = shownFindingCount({ _evidenceCount, _totalFindings })

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 px-8 py-10">
      <div className="relative w-[168px] h-[168px]">
        <svg viewBox="0 0 168 168" className="w-full h-full -rotate-90" aria-hidden="true">
          <circle cx="84" cy="84" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
          <motion.circle
            cx="84" cy="84" r={R} fill="none" stroke="var(--scan)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C - (pct / 100) * C }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </svg>
        <svg viewBox="0 0 168 168" className="absolute inset-0 w-full h-full m-spin opacity-60" aria-hidden="true">
          <defs>
            <linearGradient id="m-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--scan)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--scan)" stopOpacity=".55" />
            </linearGradient>
          </defs>
          <path d="M84 84 L84 8 A76 76 0 0 1 150 46 Z" fill="url(#m-sweep)" opacity=".25" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-semibold tabular-nums tracking-tight text-ink">{pct}%</span>
          <span className="mt-1 text-xs text-ink-dim tabular-nums">{done} / {scanners.length || '…'}</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-base font-medium text-ink">{t('modern.check.scanning')}</p>
        <p className="mt-1 text-sm text-ink-dim h-5 truncate max-w-md">
          {progress?.scannerName
            ? featureName(t, SCANNER_DISPLAY_TO_ID[progress.scannerName] ?? '', progress.scannerName)
            : t('modern.check.preparing')}
        </p>
        <p className={`mt-2 text-xs tabular-nums ${leads > 0 ? 'text-alert' : 'text-ink-dim'}`}>
          {t('modern.check.leadsSoFar', { count: leads })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 w-full max-w-4xl">
        {scanners.map((s) => {
          const r = results.find((x) => x.scannerName === s.name)
          const running = !r && progress?.scannerName === s.name
          const id = SCANNER_DISPLAY_TO_ID[s.name]
          return (
            <div key={s.name} className="flex items-center gap-2.5 h-9 px-3 rounded-lg border border-[color:var(--line)] bg-panel/60">
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {r ? (
                  r.success
                    ? <IconCheck className={`w-3.5 h-3.5 ${r.findings.length ? 'text-alert' : 'text-ok'}`} />
                    : <IconX className="w-3.5 h-3.5 text-amber" />
                ) : running ? (
                  <span className="w-2 h-2 rounded-full bg-scan m-pulse-dot" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-dim/30" />
                )}
              </span>
              <span className={`flex-1 truncate text-xs ${r || running ? 'text-ink' : 'text-ink-dim'}`}>
                {id ? featureName(t, id, s.name) : s.name}
              </span>
              {r && r.success && r.findings.length > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-alert">{r.findings.length}</span>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => void cancelScan()}
        className="h-9 px-4 flex items-center gap-2 rounded-xl border border-[color:var(--line)] text-sm text-ink-dim hover:text-alert hover:border-alert/40 transition-colors"
      >
        <IconStop className="w-3.5 h-3.5" /> {t('modern.check.cancel')}
      </button>
    </div>
  )
}
