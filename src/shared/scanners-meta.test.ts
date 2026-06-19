import { describe, it, expect } from 'vitest'
import { SCANNER_DISPLAY_TO_ID, scannerIdFromDisplayName } from './scanners-meta'
import type { ScannerName } from './types'

const ALL_IDS: ScannerName[] = [
  'appdata', 'prefetch', 'recentfiles', 'gamefolder', 'registry', 'browserhistory',
  'process', 'steam', 'amcache', 'bam', 'shellbags', 'vm', 'dnscache',
  'scheduledtasks', 'filehash', 'windowmodule'
]

describe('scanners-meta', () => {
  it('maps every ScannerName id from some display name', () => {
    const mappedIds = new Set(Object.values(SCANNER_DISPLAY_TO_ID))
    for (const id of ALL_IDS) expect(mappedIds.has(id)).toBe(true)
    expect(mappedIds.size).toBe(ALL_IDS.length)
  })

  it('resolves a known display name', () => {
    expect(scannerIdFromDisplayName('File Hash Scanner')).toBe('filehash')
    expect(scannerIdFromDisplayName('BAM/DAM Scanner')).toBe('bam')
  })

  it('returns null for an unknown display name', () => {
    expect(scannerIdFromDisplayName('Nonexistent Scanner')).toBeNull()
  })
})
