import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { CircularProgress } from '../components/ui/Progress'
import { useScanStore } from '../stores/scan-store'

export function Scan() {
  const { t } = useTranslation()
  const {
    status,
    progress,
    results,
    scanners,
    setStatus,
    setProgress,
    addResult,
    setResults,
    setScanners,
    setError,
    reset
  } = useScanStore()

  useEffect(() => {
    // Set up event listeners on component mount
    // Store functions from zustand are stable and don't change
    window.electronAPI.getScanners().then(setScanners)

    // Set up event listeners
    const unsubProgress = window.electronAPI.onScanProgress(setProgress)
    const unsubResult = window.electronAPI.onScanResult(addResult)
    const unsubComplete = window.electronAPI.onScanComplete((results) => {
      setResults(results)
      setStatus('completed')
    })
    const unsubError = window.electronAPI.onScanError((error) => {
      setError(error.message)
    })

    return () => {
      unsubProgress()
      unsubResult()
      unsubComplete()
      unsubError()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStartScan = async () => {
    reset()
    setStatus('scanning')
    try {
      await window.electronAPI.startScan()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    }
  }

  const handleCancelScan = async () => {
    await window.electronAPI.cancelScan()
    setStatus('idle')
  }

  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
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
                  status === 'completed' && totalFindings > 0
                    ? 'bg-error/10'
                    : status === 'completed'
                    ? 'bg-success/10'
                    : 'theme-active'
                }`}>
                  {status === 'completed' && totalFindings > 0 ? (
                    <svg className="w-16 h-16 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  ) : status === 'completed' ? (
                    <svg className="w-16 h-16 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-16 h-16 theme-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  )}
                </div>
              )}

              {status === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-theme-text-primary">
                    {Math.round(overallProgress)}%
                  </span>
                </div>
              )}
            </div>

            {/* Status Text */}
            <h2 className="text-xl font-semibold text-theme-text-primary mb-2">
              {status === 'scanning'
                ? t('scan.scanning')
                : status === 'completed'
                ? t('scan.scanComplete')
                : t('scan.readyToScan')}
            </h2>
            <p className="text-text-secondary mb-6">
              {status === 'scanning' && progress
                ? progress.currentPath
                : status === 'completed'
                ? `${totalFindings} ${t('scan.found')}`
                : `${scanners.length} ${t('scan.scannersReady')}`}
            </p>

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
                            ? 'bg-error/10 text-error'
                            : 'bg-success/10 text-success'
                          : isActive
                          ? 'theme-active theme-text-primary'
                          : 'bg-background-elevated text-text-muted'
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
                          <div className="w-3 h-3 border-2 theme-border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="text-xs">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${
                          isActive ? 'text-theme-text-primary' : isCompleted ? 'text-text-secondary' : 'text-text-muted'
                        }`}>
                          {scanner.name}
                        </p>
                      </div>
                      <span className={`text-xs ${
                        isCompleted ? 'text-success' : isActive ? 'theme-text-primary' : 'text-text-muted'
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
