import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AnalyzedFinding } from '../../../shared/types'
import { useScanStore } from '../../stores/scan-store'
import { extractLocalPath, severityChipClass } from '../../utils/report-view'

interface Props {
  value: string
  /** The analyzed finding for this row, when a report is available. */
  finding?: AnalyzedFinding
}

const ACTION = 'px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors'

/**
 * One finding with its severity and the checker's triage actions:
 * reveal the file in Explorer, dismiss it as a false positive for this scan,
 * or ignore its signature on every future scan. Suppressed rows stay visible
 * (struck through) with an undo, so nothing silently disappears from a case.
 */
export function FindingRow({ value, finding }: Props) {
  const { t } = useTranslation()
  const { dismissFinding, restoreFinding, ignoreSignature, unignoreSignature } = useScanStore()
  const [missing, setMissing] = useState(false)
  const path = extractLocalPath(value)

  const suppressed = !!finding && (finding.dismissed || finding.whitelisted)
  const canTriage = !!finding && finding.severity !== 'info'
  const canIgnoreSignature = canTriage && !!finding?.matched && finding.category !== 'hash'

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation()
    fn()
  }

  const reveal = async () => {
    if (!path) return
    const ok = await window.electronAPI.revealPath(path).catch(() => false)
    setMissing(!ok)
  }

  return (
    <div
      className={`group text-xs bg-panel-2 p-2 rounded-lg font-mono flex items-start gap-2 ${
        suppressed ? 'opacity-50' : 'text-ink-dim'
      }`}
    >
      {finding && (
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase not-italic ${severityChipClass(finding.severity)}`}>
          {t(`severity.${finding.severity}`)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <span className={`break-all whitespace-pre-wrap ${suppressed ? 'line-through' : ''}`}>{value}</span>
        {suppressed && (
          <p className="mt-1 font-sans text-[10px] text-ink-dim">
            {finding?.whitelisted
              ? t('triage.ignoredSignature', { signature: finding.matched })
              : t('triage.dismissedNote')}
          </p>
        )}
        {missing && <p className="mt-1 font-sans text-[10px] text-amber">{t('triage.pathMissing')}</p>}
      </div>

      <div className="shrink-0 flex flex-wrap justify-end gap-1 font-sans opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {path && (
          <button onClick={stop(reveal)} className={`${ACTION} bg-panel text-ink-dim hover:text-ink`} title={path}>
            {t('triage.reveal')}
          </button>
        )}
        {finding && suppressed && (
          <button
            onClick={stop(() =>
              finding.whitelisted && finding.matched
                ? void unignoreSignature(finding.matched)
                : void restoreFinding(finding.id)
            )}
            className={`${ACTION} bg-panel text-scan hover:bg-scan/10`}
          >
            {t('triage.restore')}
          </button>
        )}
        {finding && !suppressed && canTriage && (
          <button onClick={stop(() => void dismissFinding(finding.id))} className={`${ACTION} bg-panel text-ink-dim hover:text-ink`}>
            {t('triage.dismiss')}
          </button>
        )}
        {finding && !suppressed && canIgnoreSignature && (
          <button
            onClick={stop(() => void ignoreSignature(finding.matched!))}
            className={`${ACTION} bg-panel text-ink-dim hover:text-ink`}
            title={t('triage.ignoreHint')}
          >
            {t('triage.ignore', { signature: finding.matched })}
          </button>
        )}
      </div>
    </div>
  )
}
