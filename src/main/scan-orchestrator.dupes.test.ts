import { describe, it, expect } from 'vitest'
import { runScan } from './scan-orchestrator'

describe('runScan with a repeated scanner id', () => {
  it('counts the scanner once, so progress can reach 100 percent', async () => {
    const scanner = {
      name: 'Prefetch Scanner',
      setTimeBudget: () => {},
      scan: async () => ({ scannerName: 'Prefetch Scanner', success: true, findings: [], startTime: new Date(), endTime: new Date(), duration: 1, count: 0, hasFindings: false })
    }
    const totals: number[] = []
    const results = await runScan({
      factory: { getScanner: () => scanner } as never,
      requestedIds: ['prefetch', 'prefetch'],
      supportedIds: new Set(['prefetch']) as never,
      emit: (_channel, payload) => {
        const total = (payload as { totalItems?: number }).totalItems
        if (typeof total === 'number') totals.push(total)
      },
      signal: new AbortController().signal,
      timeoutMs: 5000
    })
    expect(results).toHaveLength(1)
    expect(new Set(totals)).toEqual(new Set([1]))
  })
})
