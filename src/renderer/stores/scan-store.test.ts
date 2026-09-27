import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStore, subscribeToScanEvents } from './scan-store'
import type { ScanReport, ScanResult, ScanProgress } from '../../shared/types'

const report: ScanReport = {
  id: 'scan-1',
  meta: { appVersion: '3.0.0', engineVersion: '1.0.0', scannedAt: '2026-06-19T00:00:00.000Z', durationMs: 10, gameId: null, signatureVersion: 'bundled-1' },
  verdict: { score: 25, band: 'low', rationale: 'An isolated keyword match', reasons: [] },
  findings: [],
  correlations: [],
  scanners: []
}

describe('scan store report', () => {
  beforeEach(() => useScanStore.getState().reset())

  it('starts with no report', () => {
    expect(useScanStore.getState().report).toBeNull()
  })

  it('stores a report', () => {
    useScanStore.getState().setReport(report)
    expect(useScanStore.getState().report?.verdict.band).toBe('low')
  })

  it('clears the report on reset', () => {
    useScanStore.getState().setReport(report)
    useScanStore.getState().reset()
    expect(useScanStore.getState().report).toBeNull()
  })
})

describe('subscribeToScanEvents', () => {
  type Handlers = {
    progress?: (p: ScanProgress) => void
    result?: (r: ScanResult) => void
    report?: (r: ScanReport) => void
    complete?: (r: ScanResult[]) => void
    error?: (e: { message: string }) => void
  }
  const unsubscribed: string[] = []
  function fakeApi(h: Handlers) {
    const sub = <T,>(key: keyof Handlers) => (cb: T) => {
      ;(h as Record<string, unknown>)[key] = cb
      return () => unsubscribed.push(key)
    }
    return {
      onScanProgress: sub<(p: ScanProgress) => void>('progress'),
      onScanResult: sub<(r: ScanResult) => void>('result'),
      onScanReport: sub<(r: ScanReport) => void>('report'),
      onScanComplete: sub<(r: ScanResult[]) => void>('complete'),
      onScanError: sub<(e: { message: string }) => void>('error')
    }
  }
  const result: ScanResult = {
    scannerName: 'Prefetch', success: true, findings: ['x'], startTime: new Date(), endTime: new Date(),
    duration: 1, count: 1, hasFindings: true
  }

  beforeEach(() => {
    useScanStore.getState().reset()
    unsubscribed.length = 0
  })

  it('applies results and completion while a scan is running', () => {
    const h: Handlers = {}
    const unsub = subscribeToScanEvents(fakeApi(h))
    useScanStore.getState().setStatus('scanning')

    h.result!(result)
    expect(useScanStore.getState()._totalFindings).toBe(1)
    h.report!(report)
    h.complete!([result])
    expect(useScanStore.getState().status).toBe('completed')
    expect(useScanStore.getState().report?.id).toBe('scan-1')
    unsub()
  })

  it('ignores late events after the user cancelled', () => {
    const h: Handlers = {}
    const unsub = subscribeToScanEvents(fakeApi(h))
    useScanStore.getState().setStatus('scanning')
    useScanStore.getState().setStatus('idle') // cancel

    h.result!(result)
    h.complete!([result])
    h.error!({ message: 'boom' })
    const s = useScanStore.getState()
    expect(s.status).toBe('idle')
    expect(s.results).toEqual([])
    expect(s.error).toBeNull()
    unsub()
  })

  it('surfaces a scan error while scanning', () => {
    const h: Handlers = {}
    const unsub = subscribeToScanEvents(fakeApi(h))
    useScanStore.getState().setStatus('scanning')
    h.error!({ message: 'boom' })
    expect(useScanStore.getState().status).toBe('error')
    expect(useScanStore.getState().error).toBe('boom')
    unsub()
  })

  it('unsubscribes every listener', () => {
    subscribeToScanEvents(fakeApi({}))()
    expect(unsubscribed.sort()).toEqual(['complete', 'error', 'progress', 'report', 'result'])
  })
})
