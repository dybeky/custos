import { describe, it, expect } from 'vitest'
import { SuppressionClock } from './suppression-time'
import type { ScanReport } from '../../shared/types'

const finding = (id: string, matched: string | null, flags: { dismissed?: boolean; whitelisted?: boolean } = {}) =>
  ({ id, matched, ...flags }) as never

const report = (...findings: unknown[]) => ({ findings }) as unknown as ScanReport
const T1 = new Date('2026-10-18T10:00:00Z')
const T2 = new Date('2026-10-18T10:05:00Z')

describe('SuppressionClock', () => {
  it('stamps an ignored signature and a dismissed finding, and leaves others alone', () => {
    const c = new SuppressionClock()
    const r = c.stamp(
      report(finding('a'.repeat(16), 'Cheat', { whitelisted: true }), finding('b'.repeat(16), null, { dismissed: true }), finding('c'.repeat(16), 'x')),
      ['cheat'], ['b'.repeat(16)], T1
    )
    expect(r.findings.map((f) => f.suppressedAt)).toEqual([T1.toISOString(), T1.toISOString(), undefined])
  })

  it('keeps the first time of a choice, and forgets it when un-ignored', () => {
    const c = new SuppressionClock()
    c.stamp(report(finding('a', 'cheat', { whitelisted: true })), ['cheat'], [], T1)
    const again = c.stamp(report(finding('a', 'cheat', { whitelisted: true })), ['cheat'], [], T2)
    expect(again.findings[0].suppressedAt).toBe(T1.toISOString())
    c.stamp(report(finding('a', 'cheat')), [], [], T2)
    const back = c.stamp(report(finding('a', 'cheat', { whitelisted: true })), ['cheat'], [], new Date('2026-10-18T11:00:00Z'))
    expect(back.findings[0].suppressedAt).toBe('2026-10-18T11:00:00.000Z')
  })
})
