import { useTranslation } from 'react-i18next'
import type { ScanReport } from '../../../shared/types'
import { featureName } from '../../utils/feature-i18n'
import { rankedCorrelations, severityChipClass } from '../../utils/report-view'
import { severityStripe } from '../../utils/results-view'
import { InfoTip } from '../ui/InfoTip'

/**
 * Leads that several independent scanners agree on, strongest first. This is
 * what a checker should read before anything else.
 */
export function KeyEvidence({ report }: { report: ScanReport }) {
  const { t } = useTranslation()
  const correlations = rankedCorrelations(report)
  if (correlations.length === 0) return null

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center gap-1.5">
        <h2 className="font-display text-sm font-bold text-ink">{t('verdict.keyEvidence')}</h2>
        <InfoTip title={t('verdict.keyEvidence')} text={t('verdict.keyEvidenceHint')} />
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {correlations.map((c) => (
          <div
            key={c.id}
            className="relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-panel/50 py-3.5 pl-5 pr-4 backdrop-blur-xl"
          >
            <span className={`absolute inset-y-0 left-0 w-1.5 ${severityStripe(c.severity)}`} />
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityChipClass(c.severity)}`}>
                {t(`severity.${c.severity}`)}
              </span>
              <span className="text-[11px] text-ink-dim">{t('verdict.seenIn', { count: c.strength })}</span>
            </div>
            <p className="mt-2 break-all font-mono text-sm font-semibold text-ink">{c.signature}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.scannerIds.map((id) => (
                <span key={id} className="rounded-md bg-ink/[0.07] px-2 py-0.5 text-[11px] text-ink-dim">
                  {featureName(t, id, report.scanners.find((s) => s.id === id)?.name ?? id)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
