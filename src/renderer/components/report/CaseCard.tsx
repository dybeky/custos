import { useTranslation } from 'react-i18next'
import type { ScanReport } from '../../../shared/types'
import { Card, CardContent } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { useScanStore } from '../../stores/scan-store'
import { useAuthStore } from '../../stores/auth-store'
import { steamIdentities, steamIdentityLabel } from '../../utils/report-view'
import { scanPlayerLabel } from '../../../shared/history'

const INPUT =
  'w-full rounded-xl bg-panel-2 border border-[color:var(--line)] px-3 py-2 text-sm text-ink ' +
  'placeholder:text-ink-dim/60 focus:outline-none focus:border-scan/50'

/**
 * Case details for the report: the player being checked (filled from the Steam
 * account detected during the scan, or one click from any other account found
 * on the PC), the signed-in checker, and free-form notes.
 */
export function CaseCard({ report }: { report: ScanReport | null }) {
  const { t } = useTranslation()
  const { caseInfo, setCaseInfo } = useScanStore()
  const checker = useAuthStore((s) => s.user?.username)
  const identities = steamIdentities(report)
  const detected = report?.meta.player

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-sm font-bold text-ink font-display">{t('case.title')}</h3>
          <InfoTip title={t('case.title')} text={t('case.hint')} />
          {checker && (
            <span className="ml-auto text-xs text-ink-dim">
              {t('case.checkedBy')}: <span className="text-ink">{checker}</span>
            </span>
          )}
        </div>

        <label className="block text-xs text-ink-dim mb-1" htmlFor="case-player">{t('case.player')}</label>
        <input
          id="case-player"
          className={INPUT}
          value={caseInfo.player}
          maxLength={200}
          placeholder={t('case.playerPlaceholder')}
          onChange={(e) => setCaseInfo({ player: e.target.value })}
        />
        {detected && caseInfo.player === scanPlayerLabel(detected) && (
          <p className="mt-1.5 text-[11px] text-scan">{t(`case.detected.${detected.source}`)}</p>
        )}
        {identities.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-dim">{t('case.foundOnPc')}</span>
            {identities.map((id) => {
              const label = steamIdentityLabel(id)
              return (
                <button
                  key={id.steamId}
                  onClick={() => setCaseInfo({ player: label })}
                  className={`px-2 py-0.5 rounded-lg text-xs font-mono transition-colors ${
                    caseInfo.player === label ? 'bg-scan/15 text-scan' : 'bg-panel-2 text-ink-dim hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        <label className="block text-xs text-ink-dim mt-3 mb-1" htmlFor="case-notes">{t('case.notes')}</label>
        <textarea
          id="case-notes"
          className={`${INPUT} min-h-[72px] resize-y`}
          value={caseInfo.notes}
          maxLength={5000}
          placeholder={t('case.notesPlaceholder')}
          onChange={(e) => setCaseInfo({ notes: e.target.value })}
        />
      </CardContent>
    </Card>
  )
}
