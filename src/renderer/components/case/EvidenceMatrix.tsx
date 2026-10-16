import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EvidenceStatus, MatrixRow } from '../../../shared/case'
import { featureName } from '../../utils/feature-i18n'
import { severityChipClass } from '../../utils/report-view'

const SHOWN = 30

const STATUS_CLASS: Record<EvidenceStatus, string> = {
  cleaned: 'bg-amber-500/10 text-amber-500',
  new: 'bg-alert/10 text-alert',
  persistent: 'bg-panel-2 text-ink-dim',
  intermittent: 'bg-panel-2 text-ink-dim'
}

/**
 * Which evidence was found in which check. Rows are leads, columns are checks
 * (oldest first); a filled dot = found in that check. What was cleaned between
 * checks comes first, then what is new.
 */
export function EvidenceMatrix({
  rows,
  onOpenCheck
}: {
  rows: MatrixRow[]
  onOpenCheck: (index: number) => void
}) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  if (rows.length === 0) return <p className="text-xs text-ink-dim">{t('casefile.matrixEmpty')}</p>

  const columns = rows[0].present.length
  const shown = all ? rows : rows.slice(0, SHOWN)

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="pb-2 pr-3 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
                &nbsp;
              </th>
              {Array.from({ length: columns }, (_, i) => (
                <th key={i} className="pb-2 px-1.5 text-center">
                  <button
                    onClick={() => onOpenCheck(i)}
                    title={t('casefile.openCheck')}
                    className="text-[10px] font-semibold text-ink-dim hover:text-scan"
                  >
                    {t('casefile.checkLabel', { n: i + 1 })}
                  </button>
                </th>
              ))}
              <th className="pb-2 pl-3 text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
                &nbsp;
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.identity} className="border-t border-[color:var(--line)] align-top">
                <td className="py-2 pr-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityChipClass(r.severity)}`}
                    >
                      {t(`severity.${r.severity}`)}
                    </span>
                    <span className="text-[11px] text-ink-dim">
                      {featureName(t, r.scannerId, r.scannerId)}
                    </span>
                    {r.matched && (
                      <span className="text-[11px] font-mono text-ink">{r.matched}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-mono text-ink-dim/80 break-all">{r.value}</p>
                </td>
                {r.present.map((p, i) => (
                  <td key={i} className="py-2 px-1.5 text-center">
                    <span
                      aria-label={p ? t('casefile.present') : t('casefile.absent')}
                      className={`inline-block h-3 w-3 rounded-full ${p ? 'bg-ink' : 'border border-ink-dim/40'}`}
                    />
                  </td>
                ))}
                <td className="py-2 pl-3 whitespace-nowrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[r.status]}`}
                  >
                    {t(`case.status.${r.status}`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN && (
        <button
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-xs font-medium text-scan hover:underline"
        >
          {all ? t('casefile.showLess') : t('casefile.showAll', { count: rows.length })}
        </button>
      )}
    </div>
  )
}
