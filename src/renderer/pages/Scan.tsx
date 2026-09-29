import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { CircularProgress } from '../components/ui/Progress'
import { InfoTip } from '../components/ui/InfoTip'
import { useScanStore, shownFindingCount } from '../stores/scan-store'
import { useGameStore } from '../stores/game-store'
import { featureName, featureHelp } from '../utils/feature-i18n'

export function Scan() {
  const { t } = useTranslation()
  const {
    status,
    progress,
    results,
    scanners,
    _totalFindings,
    _evidenceCount,
    setScanners,
    startScan,
    cancelScan
  } = useScanStore()
  const { selectedGame } = useGameStore()
  const findingCount = shownFindingCount({ _evidenceCount, _totalFindings })

  // Scan events are wired once at the app root (subscribeToScanEvents), so a
  // scan keeps updating the store while the user is on another page.
  useEffect(() => {
    window.electronAPI.getScanners().then(setScanners).catch(() => {})
  }, [setScanners])

  const handleStartScan = () => startScan(selectedGame ?? undefined)
  const handleCancelScan = () => cancelScan()

  const overallProgress = progress && scanners.length > 0
    ? (results.length / scanners.length) * 100
    : 0

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Main Scan Card */}
        <Card className="mb-6">
          <CardContent className="text-center py-12">
            {/* Scan Status Icon */}
            <div className="relative w-32 h-32 mx-auto mb-6">
              {status === 'scanning' ? (
                <CircularProgress
                  value={overallProgress}
                  size={128}
                  strokeWidth={6}
                  variant="default"
                />
              ) : (
                <div className={`w-full h-full rounded-full flex items-center justify-center ${
                  status === 'completed' && findingCount > 0
                    ? 'bg-alert/10'
                    : status === 'completed'
                    ? 'bg-scan/10'
                    : 'bg-scan/10'
                }`}>
                  {status === 'completed' && findingCount > 0 ? (
                    <svg className="w-16 h-16 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : status === 'completed' ? (
                    <svg className="w-16 h-16 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  )}
                </div>
              )}

              {status === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-scan font-display">
                    {Math.round(overallProgress)}%
                  </span>
                </div>
              )}
            </div>

            {/* Status Text */}
            <h2 className="text-xl font-semibold text-ink font-display mb-2 inline-flex items-center gap-2">
              {status === 'scanning'
                ? t('scan.scanning')
                : status === 'completed'
                ? t('scan.scanComplete')
                : t('scan.readyToScan')}
              <InfoTip title={t('scan.title')} text={t('help.scanPage')} />
            </h2>
            {status === 'scanning' && progress ? (
              <ScanPathLine scanner={progress.scannerName} path={progress.currentPath} />
            ) : (
              <p className="text-ink-dim mb-6">
                {status === 'completed'
                  ? `${findingCount} ${t('scan.found')}`
                  : `${scanners.length} ${t('scan.scannersReady')}`}
              </p>
            )}

            {/* Action Button */}
            {status === 'scanning' ? (
              <Button variant="danger" onClick={handleCancelScan}>
                {t('scan.cancelScan')}
              </Button>
            ) : (
              <Button onClick={handleStartScan} size="lg">
                {t('scan.startScan')}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Scanner Progress List - no animations */}
        {status === 'scanning' && (
          <Card>
            <CardContent>
              <div className="space-y-3">
                {scanners.map((scanner, index) => {
                  const result = results.find(r => r.scannerName === scanner.name)
                  const isActive = progress?.scannerName === scanner.name
                  const isCompleted = !!result

                  return (
                    <div key={scanner.id} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        isCompleted
                          ? result.hasFindings
                            ? 'bg-alert/10 text-alert'
                            : 'bg-scan/10 text-scan'
                          : isActive
                          ? 'bg-scan/10 text-scan'
                          : 'bg-panel-2 text-ink-dim'
                      }`}>
                        {isCompleted ? (
                          result.hasFindings ? (
                            <span className="text-xs font-bold">{result.findings.length}</span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )
                        ) : isActive ? (
                          <div className="w-3 h-3 border-2 border-scan border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-xs">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <p className={`text-sm font-medium truncate min-w-0 ${
                          isActive ? 'text-scan' : isCompleted ? 'text-ink-dim' : 'text-ink-dim/60'
                        }`}>
                          {featureName(t, scanner.id, scanner.name)}
                        </p>
                        <InfoTip
                          title={featureName(t, scanner.id, scanner.name)}
                          text={featureHelp(t, scanner.id, scanner.description)}
                        />
                      </div>
                      <span className={`text-xs ${
                        isCompleted ? 'text-scan' : isActive ? 'text-scan' : 'text-ink-dim/60'
                      }`}>
                        {isCompleted ? t('scan.complete') : isActive ? `${Math.round(progress?.percentage || 0)}%` : t('scan.pending')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * What the scan is looking at, on one fixed-height line so the card never
 * jumps or overflows: long paths lose their middle, never the file name (the
 * full path is in the tooltip).
 */
function ScanPathLine({ scanner, path }: { scanner: string; path?: string }) {
  const cut = path ? Math.max(path.lastIndexOf('\\'),path.lastIndexOf('/')) : -1
  const head = path && cut > 0 ? path.slice(0, cut + 1) : ''
  const tail = path ? (cut > 0 ? path.slice(cut + 1) : path) : ''
  return (
    <div className="mb-6 w-full max-w-md mx-auto min-w-0">
      <p className="text-sm text-ink truncate">{scanner}</p>
      <p className="mt-0.5 h-4 flex min-w-0 font-mono text-[11px] leading-4 text-ink-dim" title={path}>
        <span className="truncate min-w-0">{head}</span>
        <span className="truncate shrink-0 max-w-[60%]">{tail}</span>
      </p>
    </div>
  )
}
