import { describe, it, expect } from 'vitest'
import { BamScanner } from './bam-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

// Minimal ScanSettings for constructing BamScanner
const minimalSettings = {
  appDataScanDepth: 3,
  windowsScanDepth: 1,
  programFilesScanDepth: 2,
  userFoldersScanDepth: 3,
  recentFilesDays: 7,
  executableExtensions: ['.exe'],
  excludedDirectories: []
}

function makeScanner(): BamScanner {
  const matcher = new KeywordMatcher({ patterns: [], exactMatch: [] })
  return new BamScanner(matcher, minimalSettings)
}

describe('BamScanner.parseFiletime', () => {
  const scanner = makeScanner()

  it('converts a known FILETIME to the expected UTC date (2020-01-01 00:00:00 UTC)', () => {
    // FILETIME for 2020-01-01 00:00:00 UTC:
    //   Unix ms = 1577836800000
    //   FILETIME ticks = (1577836800000 + 11644473600000) * 10000
    //   In hex: 0x01D5C03669050000
    //   In little-endian bytes (LE string): 0000056936C0D501
    const date = scanner.parseFiletime('0000056936C0D501')
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2020)
    expect(date!.getUTCMonth()).toBe(0) // January
    expect(date!.getUTCDate()).toBe(1)
    expect(date!.getUTCHours()).toBe(0)
    expect(date!.getUTCMinutes()).toBe(0)
    expect(date!.getUTCSeconds()).toBe(0)
  })

  it('converts another known FILETIME (2023-06-15 12:30:00 UTC)', () => {
    // Unix ms for 2023-06-15 12:30:00 UTC = 1686829800000
    // FILETIME ticks in hex: 0x01D99F851A02D400
    // LE bytes: 00 D4 02 1A 85 9F D9 01
    const date = scanner.parseFiletime('00D4021A859FD901')
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2023)
    expect(date!.getUTCMonth()).toBe(5) // June
    expect(date!.getUTCDate()).toBe(15)
    expect(date!.getUTCHours()).toBe(12)
    expect(date!.getUTCMinutes()).toBe(30)
  })

  it('returns null for zero FILETIME (epoch 1601-01-01, before valid range)', () => {
    // All zeros = FILETIME of 0 (1601-01-01), which is outside the 2000-2100 sanity range
    const result = scanner.parseFiletime('0000000000000000')
    expect(result).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(scanner.parseFiletime('')).toBeNull()
  })

  it('returns null for a string shorter than 16 hex characters', () => {
    expect(scanner.parseFiletime('ABCDEF')).toBeNull()
  })

  it('returns null for a FILETIME far in the future (beyond 2100)', () => {
    // FFFFFFFFFFFFFFFF = max uint64 - well beyond 2100
    const result = scanner.parseFiletime('FFFFFFFFFFFFFFFF')
    expect(result).toBeNull()
  })

  it('strips spaces from hex string before parsing', () => {
    // Same 2020-01-01 value but with spaces
    const hexWithSpaces = '00 00 05 69 36 C0 D5 01'
    const date = scanner.parseFiletime(hexWithSpaces)
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2020)
  })
})
