import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../components/ui/Button'
import { useScanStore, shownFindingCount } from '../stores/scan-store'
import { useAuthStore } from '../stores/auth-store'
import { buildFindingLookup, buildTimeline, groupTimeline, rankedCorrelations, severityKey } from '../utils/report-view'
import { filterFindings, recentActivityCount } from '../utils/results-view'
import { featureName } from '../utils/feature-i18n'
import { buildTextReport, buildJsonReport, downloadText, exportFileStem } from '../utils/report-export'
import { buildHtmlReport } from '../utils/report-html'
import { ActivityTimeline } from '../components/report/ActivityTimeline'
import { FindingRow } from '../components/report/FindingRow'
import { CaseCard } from '../components/report/CaseCard'
import { IgnoredSignatures } from '../components/report/IgnoredSignatures'
import { RecheckCard } from '../components/history/RecheckCard'
import { SeenBeforeCard } from '../components/history/SeenBeforeCard'
import { HistoryBanner } from '../components/history/HistoryBanner'
import { SteamBansCard } from '../components/SteamBansCard'
import { SitePanel } from '../components/site/SitePanel'
import { ResultsHero } from '../components/results/ResultsHero'
import { ResultsTabs, type TabDef } from '../components/results/ResultsTabs'
import { EvidencePanel } from '../components/results/EvidencePanel'
import { ScannerGrid } from '../components/results/ScannerGrid'
import { KeyEvidence } from '../components/results/KeyEvidence'

type Tab = 'overview' | 'evidence' | 'scanners' | 'timeline' | 'case'

const PREVIEW_COUNT = 5

export function Results() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { results, status, _totalFindings, _evidenceCount, report, caseInfo, siteSeen } = useScanStore()
  const [tab, setTab] = useState<Tab>('overview')

  // A different check on screen starts at its overview again.
  const reportId = report?.id
  useEffect(() => setTab('overview'), [reportId])

  const hasResults = results.length > 0
  const findingCount = shownFindingCount({ _evidenceCount, _totalFindings })
  const lookup = useMemo(() => buildFindingLookup(report), [report])
  const keyCount = rankedCorrelations(report).length
  const recentCount = recentActivityCount(report)
  const timelineCount = useMemo(() => groupTimeline(buildTimeline(report)).length, [report])
  const scannersOk = results.filter((r) => r.success).length
  const scannersFailed = results.length - scannersOk
  const topEvidence = useMemo(
    () => filterFindings(report, { severities: new Set(), query: '', showInfo: false, showSuppressed: false }),
    [report]
  )

  const account = useAuthStore((s) => s.user?.username)
  const checker = useScanStore((s) => s.checker)
  // A check opened from the site was made by someone else: its export names that
  // checker, never the person exporting it. The site words an unsigned one as
  // "Name · no account" (just "app · no account" when no name was given).
  const siteOrigin = useScanStore((s) => s.siteOrigin)
  const siteChecker = (siteOrigin?.uploader ?? '').replace(/\s*·\s*no account$/, '').trim()
  const checkedBy = siteOrigin ? (siteChecker && siteChecker !== 'app' ? siteChecker : undefined) : checker.trim() || account
  const exportCase = { ...caseInfo, checkedBy }

  const handleExport = () => {
    const text = buildTextReport(t, report, results, i18n.language, exportCase)
    downloadText(text, `${exportFileStem(report)}.txt`, 'text/plain')
  }
  const handleExportHtml = () => {
    if (!report) return
    downloadText(buildHtmlReport(t, report, i18n.language, exportCase), `${exportFileStem(report)}.html`, 'text/html')
  }
  const handleExportJSON = () => {
    downloadText(buildJsonReport(report, results, new Date(), exportCase), `${exportFileStem(report)}.json`, 'application/json')
  }

  if (!hasResults && !report) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="animate-fade-in max-w-md text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-scan/30 bg-scan/10 shadow-[0_0_40px_-8px_rgba(var(--glow),.45)]">
            <svg className="h-9 w-9 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">{t('results.noCheckYet')}</h1>
          <p className="mt-2 text-sm text-ink-dim">{status === 'idle' ? t('results.runScanToSee') : t('results.noResultsYet')}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => navigate('/scan')}>{t('results.goScan')}</Button>
            <Button variant="secondary" onClick={() => navigate('/history')}>{t('results.openHistory')}</Button>
          </div>
        </div>
      </div>
    )
  }

  const tabs: TabDef<Tab>[] = [
    { key: 'overview', label: t('results.tab.overview') },
    { key: 'evidence', label: t('results.tab.evidence'), count: findingCount, alert: true },
    { key: 'scanners', label: t('results.tab.scanners'), count: results.length },
    ...(timelineCount > 0 ? [{ key: 'timeline' as const, label: t('results.tab.timeline'), count: timelineCount }] : []),
    { key: 'case', label: t('results.tab.case') }
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl animate-fade-in">
        <HistoryBanner onBack={() => navigate('/history')} />

        {report ? (
          <ResultsHero
            report={report}
            player={caseInfo.player}
            evidenceCount={findingCount}
            keyEvidenceCount={keyCount}
            recentCount={recentCount}
            scannersOk={scannersOk}
            scannersFailed={scannersFailed}
            onExportText={handleExport}
            onExportHtml={handleExportHtml}
            onExportJson={handleExportJSON}
          />
        ) : (
          <div className="mb-5 rounded-3xl border border-[color:var(--line)] bg-panel/40 p-6">
            <h1 className="font-display text-xl font-bold text-ink">{t('results.scanResults')}</h1>
            <p className="mt-1 text-sm text-ink-dim">{t('results.scanning')}</p>
          </div>
        )}

        {report && <ResultsTabs tabs={tabs} active={tab} onChange={setTab} />}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={report ? tab : 'scanners'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {(!report || tab === 'scanners') && <ScannerGrid results={results} report={report} />}

            {report && tab === 'overview' && (
              <>
                <KeyEvidence report={report} />
                <SteamBansCard />
                {siteSeen ? <SeenBeforeCard /> : <RecheckCard />}

                <section className="mb-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold text-ink">{t('results.topEvidence')}</h2>
                    {topEvidence.length > PREVIEW_COUNT && (
                      <button onClick={() => setTab('evidence')} className="text-xs font-medium text-scan hover:underline">
                        {t('results.seeAll', { count: topEvidence.length })}
                      </button>
                    )}
                  </div>
                  {topEvidence.length === 0 ? (
                    <div className="rounded-2xl border border-scan/25 bg-scan/[0.06] p-6 text-center">
                      <p className="text-sm font-medium text-scan">
                        {_totalFindings > 0 ? t('results.contextOnly') : t('results.noThreatsFound')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {topEvidence.slice(0, PREVIEW_COUNT).map((f) => (
                        <FindingRow
                          key={f.id}
                          value={f.value}
                          finding={lookup.get(severityKey(f.scannerId, f.value)) ?? f}
                          scannerLabel={featureName(t, f.scannerId, report.scanners.find((s) => s.id === f.scannerId)?.name ?? f.scannerId)}
                        />
                      ))}
                    </div>
                  )}
                </section>
                <IgnoredSignatures />
              </>
            )}

            {report && tab === 'evidence' && <EvidencePanel report={report} />}
            {report && tab === 'timeline' && <ActivityTimeline report={report} />}

            {report && tab === 'case' && (
              <div className="grid gap-5 lg:grid-cols-2">
                <CaseCard report={report} />
                <div>
                  <SitePanel />
                  <IgnoredSignatures />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
