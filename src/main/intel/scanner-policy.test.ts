import { describe, it, expect } from 'vitest'
import { SCANNER_POLICY, DEFAULT_POLICY, RISK_ENGINE_VERSION } from './scanner-policy'
import type { ScannerName } from '../../shared/types'

const ALL_IDS: ScannerName[] = [
  'appdata', 'prefetch', 'recentfiles', 'gamefolder', 'registry', 'browserhistory',
  'process', 'steam', 'amcache', 'bam', 'shellbags', 'vm', 'dnscache',
  'scheduledtasks', 'filehash', 'windowmodule'
]

describe('scanner-policy', () => {
  it('has a policy entry for every scanner', () => {
    for (const id of ALL_IDS) expect(SCANNER_POLICY[id]).toBeDefined()
  })

  it('classifies high-signal scanners correctly', () => {
    expect(SCANNER_POLICY.filehash).toEqual({ category: 'hash', baseSeverity: 'critical' })
    expect(SCANNER_POLICY.bam).toEqual({ category: 'execution', baseSeverity: 'high' })
    expect(SCANNER_POLICY.process).toEqual({ category: 'runtime', baseSeverity: 'high' })
    expect(SCANNER_POLICY.scheduledtasks).toEqual({ category: 'persistence', baseSeverity: 'high' })
  })

  it('classifies low-signal scanners as context/environment', () => {
    expect(SCANNER_POLICY.steam).toEqual({ category: 'context', baseSeverity: 'low' })
    expect(SCANNER_POLICY.vm).toEqual({ category: 'environment', baseSeverity: 'info' })
  })

  it('exposes a default policy and an engine version', () => {
    expect(DEFAULT_POLICY).toEqual({ category: 'context', baseSeverity: 'low' })
    expect(RISK_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
