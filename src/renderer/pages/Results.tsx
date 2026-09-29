import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { InfoTip } from '../components/ui/InfoTip'
import { useScanStore, shownFindingCount } from '../stores/scan-store'
import { SCANNER_NAME_TO_ID, featureName, featureHelp } from '../utils/feature-i18n'
import {
  buildFindingLookup, severityKey, severityChipClass, bandChipClass,
  reasonText, coverageReason, rankedCorrelations, scannerEvidenceCount
} from '../utils/report-view'
import { ActivityTimeline } from '../components/report/ActivityTimeline'
import { FindingRow } from '../components/report/FindingRow'
import { CaseCard } from '../components/report/CaseCard'
import { RecheckCard } from '../components/history/RecheckCard'
import { SitePanel } from '../components/site/SitePanel'
import { HistoryBanner } from '../components/history/HistoryBanner'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { IgnoredSignatures } from '../components/report/IgnoredSignatures'
import { buildTextReport, buildJsonReport, downloadText, exportFileStem } from '../utils/report-export'
import { SCANNER_DISPLAY_TO_ID } from '../../shared/scanners-meta'

export function Results() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { results, status, _totalFindings, _evidenceCount, report, caseInfo } = useScanStore()
  const [expandedScanner, setExpandedScanner] = useState<string | null>(null)
  const hasResults = results.length > 0
  const findingLookup = buildFindingLookup(report)
  const findingCount = shownFindingCount({ _evidenceCount, _totalFindings })
  const contextOnly = report !== null && findingCount === 0 && _totalFindings > 0
  const coverage = coverageReason(report)
  const correlations = rankedCorrelations(report)
  const primaryReason = report?.verdict.reasons.find(r => r.code !== 'incomplete-coverage')

  const account = useAuthStore(s => s.user?.username)
  const checker = useScanStore(s => s.checker)
  const exportCase = { ...caseInfo, checkedBy: checker.trim() || account }

  const handleExport = () => {
    const text = buildTextReport(t, report, results, i18n.language, exportCase)
    downloadText(text, `${exportFileStem(report)}.txt`, 'text/plain')
  }

  const handleExportJSON = () => {
    downloadText(buildJsonReport(report, results, new Date(), exportCase), `${exportFileStem(report)}.json`, 'application/json')
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="animate-fade-in">
        <HistoryBanner onBack={() => navigate('/history')} />
        {report && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1 rounded-lg text-sm font-bold ${bandChipClass(report.verdict.band)}`}>
                    {t(`verdict.band.${report.verdict.band}`)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-ink font-display">{t('verdict.title')}</h2>
                    <p className="text-sm text-ink-dim">
                      {primaryReason ? reasonText(t, primaryReason) : report.verdict.rationale}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-ink font-display">{report.verdict.score}</div>
                  <div className="text-xs text-ink-dim">{t('verdict.score')}</div>
                </div>
              </div>
              {coverage && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
                  <svg className="w-4 h-4 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{reasonText(t, coverage)}</span>
                </div>
              )}
              <p className="mt-3 text-xs text-ink-dim/80 border-t border-[color:var(--line)] pt-3">
                {t('verdict.leadsNotProof')}
              </p>
            </CardContent>
          </Card>
        )}
        <RecheckCard />
        <SitePanel />
        {correlations.length > 0 && report && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center gap-1.5 mb-3">
                <h3 className="text-sm font-bold text-ink font-display">{t('verdict.keyEvidence')}</h3>
                <InfoTip title={t('verdict.keyEvidence')} text={t('verdict.keyEvidenceHint')} />
              </div>
              <div className="space-y-2">
                {correlations.map(c => (
                  <div key={c.id} className="flex items-start gap-3 rounded-xl bg-panel-2 px-3 py-2">
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${severityChipClass(c.severity)}`}>
                      {t(`severity.${c.severity}`)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-ink break-all">{c.signature}</p>
                      <p className="text-xs text-ink-dim">
                        {t('verdict.seenIn', { count: c.strength })}:{' '}
                        {c.scannerIds
                          .map(id => featureName(t, id, report.scanners.find(s => s.id === id)?.name ?? id))
                          .join(', ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {report && <ActivityTimeline report={report} />}
        {hasResults && <CaseCard report={report} />}
        <IgnoredSignatures />
        {/* Summary Card */}
        <Card className="mb-6">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  findingCount > 0 ? 'bg-alert/10' : 'bg-scan/10'
                }`}>
                  {findingCount > 0 ? (
                    <svg className="w-8 h-8 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-ink font-display">
                    {t('results.scanResults')}
                  </h2>
                  <p className={`text-sm ${findingCount > 0 ? 'text-alert' : hasResults ? 'text-scan' : 'text-ink-dim'}`}>
                    {/* Before any check there is nothing to call clean. */}
                    {!hasResults
                      ? t('results.noCheckYet')
                      : findingCount > 0
                      ? `${findingCount} ${t('results.evidenceFound')}`
                      : contextOnly
                      ? t('results.contextOnly')
                      : t('results.noThreatsFound')}
                  </p>
                </div>
              </div>
              {hasResults && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleExport}>
                    {t('results.exportResults')}
                  </Button>
                  <Button variant="secondary" onClick={handleExportJSON}>
                    {t('results.exportJSON')}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results List */}
        {!hasResults ? (
          <Card>
            <CardContent className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-ink-dim mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-ink-dim">
                {status === 'idle' ? t('results.runScanToSee') : t('results.noResultsYet')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {results.map((result, index) => {
              const scannerId = SCANNER_NAME_TO_ID[result.scannerName]
              const scannerLabel = scannerId
                ? featureName(t, scannerId, result.scannerName)
                : result.scannerName
              // With a report, only evidence counts as a hit; scanners that
              // only produced system information (e.g. Steam accounts) stay neutral.
              const evidenceCount = report
                ? (scannerId ? scannerEvidenceCount(report, scannerId) : 0)
                : result.findings.length
              return (
              <div
                key={result.scannerName}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Card
                  className="cursor-pointer hover:border-[color:var(--line-strong)] transition-colors"
                  onClick={() => setExpandedScanner(
                    expandedScanner === result.scannerName ? null : result.scannerName
                  )}
                >
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          !result.success
                            ? 'bg-amber/10 text-amber'
                            : evidenceCount > 0
                            ? 'bg-alert/10 text-alert'
                            : result.hasFindings
                            ? 'bg-panel-2 text-ink-dim'
                            : 'bg-scan/10 text-scan'
                        }`}>
                          {!result.success ? (
                            <span className="text-sm font-bold">!</span>
                          ) : result.hasFindings ? (
                            <span className="text-sm font-bold">{evidenceCount > 0 ? evidenceCount : result.findings.length}</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-ink">{scannerLabel}</p>
                            {scannerId && (
                              <InfoTip title={scannerLabel} text={featureHelp(t, scannerId)} />
                            )}
                          </div>
                          <p className={`text-xs ${result.success ? 'text-ink-dim' : 'text-amber'}`}>
                            {result.success
                              ? `${result.duration}ms`
                              : `${t('results.checkFailed')}${result.error ? `: ${result.error}` : ''}`}
                          </p>
                        </div>
                      </div>
                      <motion.svg
                        animate={{ rotate: expandedScanner === result.scannerName ? 180 : 0 }}
                        className="w-5 h-5 text-ink-dim"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </div>

                    <AnimatePresence>
                      {expandedScanner === result.scannerName && result.findings.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-[color:var(--line)]"
                        >
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {result.findings.map((finding, i) => {
                              const sid = SCANNER_DISPLAY_TO_ID[result.scannerName]
                              return (
                                <FindingRow
                                  key={i}
                                  value={finding}
                                  finding={sid ? findingLookup.get(severityKey(sid, finding)) : undefined}
                                />
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
