import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { InfoTip } from '../components/ui/InfoTip'
import { ScoreTrend } from '../components/case/ScoreTrend'
import { EvidenceMatrix } from '../components/case/EvidenceMatrix'
import { CompareChecks } from '../components/case/CompareChecks'
import { useScanStore } from '../stores/scan-store'
import { useAuthStore } from '../stores/auth-store'
import { bandChipClass } from '../utils/report-view'
import { buildCasePackage } from '../utils/case-package'
import { downloadBytes } from '../utils/report-export'
import { caseChecks, evidenceMatrix, matrixCounts, type EvidenceStatus } from '../../shared/case'
import type { HistoryEntry } from '../../shared/history'
import { dateLocale } from '../utils/date-locale'

const STATUS_CHIP: Record<EvidenceStatus, string> = {
  cleaned: 'bg-amber-500/10 text-amber-500',
  new: 'bg-alert/10 text-alert',
  persistent: 'bg-panel-2 text-ink-dim',
  intermittent: 'bg-panel-2 text-ink-dim'
}

/**
 * Case mode: one player, every check of this session side by side. The trend,
 * the evidence matrix and the comparison show how the picture changed between
 * checks; the package keeps it all, with a SHA-256 list, as one zip.
 */
export function Case() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { key = '' } = useParams()
  // The router has already decoded the segment; decoding again throws on a name holding "%".
  const playerKey = key
  const { history, loadHistory, openHistory, checker } = useScanStore()
  const account = useAuthStore((s) => s.user?.username)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [building, setBuilding] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const checks = useMemo(() => caseChecks(history, playerKey), [history, playerKey])
  const ids = checks.map((c) => c.id).join(',')

  useEffect(() => {
    let alive = true
    if (checks.length === 0) {
      setEntries([])
      return
    }
    void Promise.all(checks.map((c) => window.electronAPI.getHistory(c.id).catch(() => null))).then(
      (list) => {
        if (alive) setEntries(list.filter((e): e is HistoryEntry => e !== null))
      }
    )
    return () => {
      alive = false
    }
    // `ids` changes exactly when the player's set of checks changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const rows = useMemo(() => evidenceMatrix((entries ?? []).map((e) => e.report)), [entries])
  const counts = matrixCounts(rows)
  const fmt = new Intl.DateTimeFormat(dateLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' })

  if (entries && entries.length === 0) {
    return (
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto animate-fade-in">
          <button
            onClick={() => navigate('/history')}
            className="text-xs text-scan hover:underline"
          >
            {t('casefile.back')}
          </button>
          <div className="mt-4 rounded-2xl border border-[color:var(--line)] bg-panel p-10 text-center text-sm text-ink-dim">
            {t('casefile.notFound')}
          </div>
        </div>
      </div>
    )
  }

  const list = entries ?? []
  const player =
    list[list.length - 1]?.case.player.trim() || checks[checks.length - 1]?.player || ''
  const openCheck = async (index: number) => {
    const entry = list[index]
    if (entry && (await openHistory(entry.report.id))) navigate('/results')
  }

  const exportPackage = async () => {
    setBuilding(true)
    setMessage('')
    try {
      const pkg = await buildCasePackage({
        t,
        entries: list,
        locale: i18n.language,
        checkedBy: checker.trim() || account
      })
      downloadBytes(pkg.bytes, pkg.fileName, 'application/zip')
      setMessage(t('casefile.exported', { name: pkg.fileName }))
    } catch {
      setMessage(t('casefile.exportFailed'))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto animate-fade-in">
        <button onClick={() => navigate('/history')} className="text-xs text-scan hover:underline">
          {t('casefile.back')}
        </button>

        <div className="mt-3 mb-5">
          <p className="text-2xs font-semibold tracking-[0.22em] text-ink-dim font-display uppercase">
            {t('casefile.title')}
          </p>
          <h1 className="text-2xl font-bold text-ink font-display break-all">{player || '—'}</h1>
          {checks.length > 0 && (
            <p className="mt-1 text-sm text-ink-dim">
              {t('casefile.checks', { count: checks.length })} ·{' '}
              {t('casefile.firstLast', {
                first: fmt.format(new Date(checks[0].scannedAt)),
                last: fmt.format(new Date(checks[checks.length - 1].scannedAt))
              })}
            </p>
          )}
        </div>

        <Card className="mb-4">
          <CardContent>
            <div className="flex items-center gap-1.5 mb-2">
              <h3 className="text-sm font-bold text-ink font-display">
                {t('casefile.trendTitle')}
              </h3>
              <InfoTip title={t('casefile.trendTitle')} text={t('casefile.trendHint')} />
            </div>
            <ScoreTrend checks={checks} />
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {checks.length > 0 && (
                <span
                  className={`px-2 py-1 rounded-lg font-semibold ${bandChipClass(checks[checks.length - 1].band)}`}
                >
                  {t(`verdict.band.${checks[checks.length - 1].band}`)} (
                  {checks[checks.length - 1].score})
                </span>
              )}
              {(['cleaned', 'new', 'persistent', 'intermittent'] as const).map(
                (s) =>
                  counts[s] > 0 && (
                    <span key={s} className={`px-2 py-1 rounded-lg ${STATUS_CHIP[s]}`}>
                      {t(`case.status.${s}`)}: {counts[s]}
                    </span>
                  )
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent>
            <div className="flex items-center gap-1.5 mb-3">
              <h3 className="text-sm font-bold text-ink font-display">
                {t('casefile.matrixTitle')}
              </h3>
              <InfoTip title={t('casefile.matrixTitle')} text={t('casefile.matrixHint')} />
            </div>
            <EvidenceMatrix rows={rows} onOpenCheck={(i) => void openCheck(i)} />
          </CardContent>
        </Card>

        {list.length >= 2 && (
          <Card className="mb-4">
            <CardContent>
              <h3 className="text-sm font-bold text-ink font-display mb-3">
                {t('casefile.compareTitle')}
              </h3>
              <CompareChecks entries={list} />
            </CardContent>
          </Card>
        )}

        {list.some((e) => e.case.notes.trim()) && (
          <Card className="mb-4">
            <CardContent>
              <h3 className="text-sm font-bold text-ink font-display mb-3">
                {t('casefile.notesTitle')}
              </h3>
              <ul className="space-y-2">
                {list.map(
                  (e, i) =>
                    e.case.notes.trim() && (
                      <li key={e.id} className="text-xs text-ink-dim">
                        <span className="font-semibold text-ink">
                          {t('casefile.checkLabel', { n: i + 1 })} ·{' '}
                          {fmt.format(new Date(e.report.meta.scannedAt))}
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap">{e.case.notes.trim()}</p>
                      </li>
                    )
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="mb-4">
          <CardContent>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-sm font-bold text-ink font-display">
                {t('casefile.exportTitle')}
              </h3>
            </div>
            <p className="text-xs text-ink-dim mb-3">{t('casefile.exportHint')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void exportPackage()} disabled={building || list.length === 0}>
                {building ? t('casefile.exporting') : t('casefile.exportButton')}
              </Button>
              {message && <span className="text-xs text-ink-dim break-all">{message}</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
