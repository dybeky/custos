import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import type { LiveFinding, LiveScanStatus } from '../../shared/types'
import { useGameStore } from '../stores/game-store'

type ScanPhase = 'idle' | 'scanning' | 'done'

interface LiveProgress {
  detectorName: string
  current: number
  total: number
  percentage: number
}

export function LiveScan() {
  const { t } = useTranslation()
  const { selectedGame } = useGameStore()

  const [status, setStatus] = useState<LiveScanStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [findings, setFindings] = useState<LiveFinding[]>([])
  const [progress, setProgress] = useState<LiveProgress | null>(null)

  // hold unsubscribe fns in a ref so cleanup is always current
  const unsubRef = useRef<Array<() => void>>([])

  const clearSubs = () => {
    unsubRef.current.forEach(fn => fn())
    unsubRef.current = []
  }

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const s = await window.electronAPI.getLiveStatus(selectedGame ?? undefined)
      setStatus(s)
    } finally {
      setStatusLoading(false)
    }
  }, [selectedGame])

  // Refresh capability/status whenever the selected game changes (fetchStatus
  // is memoized on selectedGame).
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Tear down any live-scan listeners only on unmount.
  useEffect(() => {
    return () => {
      clearSubs()
    }
  }, [])

  const isReady =
    status !== null &&
    status.platform === 'win32' &&
    status.nativeAvailable &&
    status.gameRunning

  const handleStartScan = async () => {
    // Guard against re-entrancy: a second start would orphan the first scan's
    // listeners (overwriting unsubRef) and leak duplicate handlers.
    if (phase === 'scanning') return

    setFindings([])
    setProgress(null)
    setPhase('scanning')

    const unsubProgress = window.electronAPI.onLiveScanProgress(p => {
      setProgress({
        detectorName: p.detectorName,
        current: p.current,
        total: p.total,
        percentage: p.percentage,
      })
    })

    const unsubResult = window.electronAPI.onLiveScanResult(finding => {
      setFindings(prev => [...prev, finding])
    })

    const unsubComplete = window.electronAPI.onLiveScanComplete(() => {
      setPhase('done')
      setProgress(null)
      clearSubs()
    })

    unsubRef.current = [unsubProgress, unsubResult, unsubComplete]

    try {
      await window.electronAPI.startLiveScan(selectedGame ?? undefined)
    } catch {
      setPhase('done')
      clearSubs()
    }
  }

  // ── Status banner ────────────────────────────────────────────────────────

  const renderStatusBanner = () => {
    if (statusLoading) {
      return (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-panel border border-[color:var(--line)]">
          <div className="w-4 h-4 border-2 border-scan border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-ink-dim">{t('liveScan.checkingStatus')}</span>
        </div>
      )
    }

    if (!status || status.platform !== 'win32') {
      return (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-panel border border-[color:var(--line)]">
          <div className="w-8 h-8 rounded-lg bg-scan/10 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-scan font-display">{t('liveScan.windowsOnly')}</p>
            <p className="text-xs text-ink-dim mt-0.5">{t('liveScan.windowsOnlyDesc')}</p>
          </div>
        </div>
      )
    }

    if (!status.nativeAvailable) {
      return (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-panel border border-[color:var(--line)]">
          <div className="w-8 h-8 rounded-lg bg-scan/10 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-scan font-display">{t('liveScan.nativeUnavailable')}</p>
            <p className="text-xs text-ink-dim mt-0.5">{t('liveScan.nativeUnavailableDesc', { arch: status.arch })}</p>
          </div>
        </div>
      )
    }

    if (!status.gameRunning) {
      return (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-panel border border-amber/30">
          <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-amber font-display">{t('liveScan.gameNotRunning')}</p>
            <p className="text-xs text-ink-dim mt-0.5">{t('liveScan.gameNotRunningDesc')}</p>
          </div>
        </div>
      )
    }

    // ready
    return (
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-panel border border-scan/30 glow-scan">
        <div className="w-8 h-8 rounded-lg bg-scan/10 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-scan font-display">{t('liveScan.gameDetected')}</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {status.gameName
              ? t('liveScan.gameDetectedDesc', { name: status.gameName })
              : t('liveScan.readyToScan')}
          </p>
        </div>
      </div>
    )
  }

  // ── Finding card ─────────────────────────────────────────────────────────

  const renderFinding = (finding: LiveFinding, index: number) => {
    const isHigh = finding.confidence === 'high'
    const isSuspicious = finding.confidence === 'suspicious'

    const chipClass = isHigh
      ? 'bg-alert/10 text-alert border border-alert/30'
      : isSuspicious
      ? 'bg-amber/10 text-amber border border-amber/30'
      : 'bg-scan/10 text-scan border border-scan/20'

    const titleClass = isHigh
      ? 'text-alert'
      : isSuspicious
      ? 'text-amber'
      : 'text-scan'

    const chipLabel = isHigh
      ? t('liveScan.confidenceHigh')
      : isSuspicious
      ? t('liveScan.confidenceSuspicious')
      : t('liveScan.confidenceInfo')

    return (
      <div
        key={`${finding.detectorId}-${index}`}
        className="animate-fade-in rounded-2xl bg-panel border border-[color:var(--line)] p-4"
        style={{ animationDelay: `${index * 40}ms` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-medium font-display ${chipClass}`}>
                {chipLabel}
              </span>
              <span className="text-xs text-ink-dim">{finding.detectorName}</span>
            </div>
            <p className={`text-sm font-medium font-display ${titleClass}`}>{finding.title}</p>
            <p className="text-xs text-ink-dim mt-1 break-all">{finding.detail}</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────

  const highCount = findings.filter(f => f.confidence === 'high').length
  const suspiciousCount = findings.filter(f => f.confidence === 'suspicious').length

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">

        {/* Main control card */}
        <Card className="mb-4">
          <CardContent className="text-center py-10">
            {/* Icon */}
            <div className={`w-24 h-24 mx-auto mb-5 rounded-full flex items-center justify-center ${
              phase === 'done' && highCount > 0
                ? 'bg-alert/10'
                : phase === 'done'
                ? 'bg-scan/10'
                : 'bg-scan/10'
            }`}>
              {phase === 'scanning' ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="absolute w-full h-full rounded-full border-2 border-scan border-t-transparent animate-spin" />
                  <svg className="w-10 h-10 text-scan relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
                  </svg>
                </div>
              ) : phase === 'done' && highCount > 0 ? (
                <svg className="w-12 h-12 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-12 h-12 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H4a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-1" />
                </svg>
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl font-semibold text-ink font-display mb-1">
              {phase === 'scanning'
                ? t('liveScan.scanning')
                : phase === 'done'
                ? t('liveScan.scanComplete')
                : t('liveScan.title')}
            </h2>

            {/* Subtitle */}
            <p className="text-sm text-ink-dim mb-6">
              {phase === 'scanning' && progress
                ? `${progress.detectorName} — ${Math.round(progress.percentage)}%`
                : phase === 'done'
                ? highCount > 0
                  ? `${highCount} ${t('liveScan.highThreats')}, ${suspiciousCount} ${t('liveScan.suspicious')}`
                  : t('liveScan.noThreatsFound')
                : t('liveScan.subtitle')}
            </p>

            {/* Start button */}
            <Button
              onClick={handleStartScan}
              size="lg"
              disabled={!isReady || phase === 'scanning'}
              isLoading={phase === 'scanning'}
              loadingText={t('liveScan.scanning')}
            >
              {phase === 'done' ? t('liveScan.scanAgain') : t('liveScan.startScan')}
            </Button>
          </CardContent>
        </Card>

        {/* Status banner + refresh */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">{renderStatusBanner()}</div>
          <button
            onClick={fetchStatus}
            disabled={statusLoading || phase === 'scanning'}
            className="shrink-0 flex items-center justify-center w-10 h-10 mt-0.5 rounded-xl text-ink-dim hover:text-ink hover:bg-panel-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('liveScan.refreshStatus')}
          >
            <svg
              className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Findings list */}
        {(findings.length > 0 || phase === 'done') && (
          <div>
            {findings.length === 0 ? (
              <div className="rounded-2xl bg-panel border border-[color:var(--line)] p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-scan/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-scan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-scan font-display">{t('liveScan.noLiveThreats')}</p>
                <p className="text-xs text-ink-dim mt-1">{t('liveScan.noLiveThreatsDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {findings.map((f, i) => renderFinding(f, i))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
