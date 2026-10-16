import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import type { ScanReport, ScanResult } from '../../../shared/types'
import { SCANNER_NAME_TO_ID, featureName, featureHelp } from '../../utils/feature-i18n'
import { buildFindingLookup, severityKey, scannerEvidenceCount } from '../../utils/report-view'
import { scannerState, type ScannerState } from '../../utils/results-view'
import { InfoTip } from '../ui/InfoTip'
import { FindingRow } from '../report/FindingRow'

const TONE: Record<ScannerState, { icon: string; label: string }> = {
  failed: { icon: 'bg-amber/15 text-amber', label: 'text-amber' },
  partial: { icon: 'bg-amber/10 text-amber', label: 'text-amber' },
  hit: { icon: 'bg-alert/15 text-alert', label: 'text-alert' },
  info: { icon: 'bg-ink/10 text-ink-dim', label: 'text-ink-dim' },
  clean: { icon: 'bg-scan/10 text-scan', label: 'text-scan' }
}

/**
 * One tile per scanner: whether it ran, what it found and how long it took.
 * Tiles with something to show open to the findings underneath the grid.
 */
export function ScannerGrid({ results, report }: { results: ScanResult[]; report: ScanReport | null }) {
  const { t } = useTranslation()
  const [openName, setOpenName] = useState<string | null>(null)
  const lookup = buildFindingLookup(report)
  const slowest = Math.max(1, ...results.map((r) => r.duration))

  const tiles = results.map((result) => {
    const id = SCANNER_NAME_TO_ID[result.scannerName]
    const label = id ? featureName(t, id, result.scannerName) : result.scannerName
    const meta = id ? report?.scanners.find((s) => s.id === id) : undefined
    const evidence = report ? (id ? scannerEvidenceCount(report, id) : 0) : result.findings.length
    const state = scannerState({ success: result.success, partial: result.partial ?? meta?.partial }, evidence, result.findings.length)
    return { result, id, label, evidence, state }
  })
  // Failures first, then evidence, then the quiet ones.
  const order: ScannerState[] = ['failed', 'hit', 'partial', 'info', 'clean']
  tiles.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || b.evidence - a.evidence)
  const open = tiles.find((x) => x.result.scannerName === openName)

  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ result, id, label, evidence, state }, i) => {
          const selected = openName === result.scannerName
          const canOpen = result.findings.length > 0
          const tone = TONE[state]
          return (
            <motion.button
              key={result.scannerName}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.03 }}
              onClick={() => canOpen && setOpenName(selected ? null : result.scannerName)}
              aria-expanded={canOpen ? selected : undefined}
              className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition-colors ${
                selected ? 'border-scan/50 bg-scan/[0.06]' : 'border-[color:var(--line)] bg-panel/40 hover:border-[color:var(--line-strong)]'
              } ${canOpen ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${tone.icon}`}>
                  {state === 'failed' ? (
                    '!'
                  ) : state === 'hit' ? (
                    evidence
                  ) : state === 'info' ? (
                    result.findings.length
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">{label}</span>
                    {id && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <InfoTip title={label} text={featureHelp(t, id)} />
                      </span>
                    )}
                  </span>
                  <span className={`block truncate text-[11px] ${tone.label}`}>
                    {t(`results.scannerState.${state}`)}
                    {state === 'failed' && result.error ? `: ${result.error}` : ''}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-ink-dim/50" style={{ width: `${Math.max(4, (result.duration / slowest) * 100)}%` }} />
                </div>
                <span className="font-mono text-[10px] text-ink-dim">{result.duration}ms</span>
              </div>
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open.result.scannerName}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-scan/30 bg-panel/40 p-4">
              <p className="mb-3 text-sm font-semibold text-ink">
                {open.label} <span className="font-normal text-ink-dim">· {open.result.findings.length}</span>
              </p>
              {open.result.partial && <p className="mb-3 text-xs text-amber">{open.result.partial}</p>}
              <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                {open.result.findings.map((finding, i) => (
                  <FindingRow
                    key={i}
                    value={finding}
                    finding={open.id ? lookup.get(severityKey(open.id, finding)) : undefined}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
