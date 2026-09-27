import { describe, it, expect } from 'vitest'
import {
  TRACE_PREFIX, MIN_EXPECTED_PREFETCH_FILES, CLEANER_WINDOW_MS, LOG_CLEAR_WINDOW_MS,
  assessCleanerRuns, assessLogClears, assessPrefetchConfig, assessPrefetchVolume,
  formatWhen, parseEventTimes, parseRegDword, type PrefetchEntry
} from './anti-forensics'

const NOW = Date.parse('2026-09-27T14:00:00Z')
const H = 60 * 60 * 1000

describe('parseRegDword', () => {
  const out = [
    'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters',
    '    EnablePrefetcher    REG_DWORD    0x3',
    ''
  ].join('\r\n')

  it('reads a hex DWORD', () => {
    expect(parseRegDword(out, 'EnablePrefetcher')).toBe(3)
    expect(parseRegDword('    Start    REG_DWORD    0x4', 'Start')).toBe(4)
  })
  it('returns null for a missing value or failed query', () => {
    expect(parseRegDword(out, 'Start')).toBeNull()
    expect(parseRegDword('', 'EnablePrefetcher')).toBeNull()
  })
})

describe('assessPrefetchConfig', () => {
  it('flags disabled prefetch and a disabled SysMain service', () => {
    const out = assessPrefetchConfig(0, 4)
    expect(out).toHaveLength(2)
    expect(out.every((f) => f.startsWith(TRACE_PREFIX))).toBe(true)
  })
  it('stays quiet for the default configuration or when unreadable', () => {
    expect(assessPrefetchConfig(3, 2)).toEqual([])
    expect(assessPrefetchConfig(null, null)).toEqual([])
  })
})

describe('assessPrefetchVolume', () => {
  const pf = (n: number): PrefetchEntry[] =>
    Array.from({ length: n }, (_, i) => ({ name: `APP${i}.EXE-0000000${i % 10}.pf`, mtimeMs: NOW }))

  it('flags an almost empty prefetch folder', () => {
    expect(assessPrefetchVolume(pf(4))[0]).toContain('only 4 file(s)')
  })
  it('accepts a normally populated folder', () => {
    expect(assessPrefetchVolume(pf(MIN_EXPECTED_PREFETCH_FILES))).toEqual([])
  })
  it('ignores non-.pf files (Layout.ini, databases)', () => {
    const entries = [...pf(MIN_EXPECTED_PREFETCH_FILES - 1), { name: 'Layout.ini', mtimeMs: NOW }]
    expect(assessPrefetchVolume(entries)).toHaveLength(1)
  })
})

describe('assessCleanerRuns', () => {
  it('reports a recent cleaner run once per tool, with its latest time', () => {
    const out = assessCleanerRuns([
      { name: 'CCLEANER64.EXE-1A2B3C4D.pf', mtimeMs: NOW - 2 * H },
      { name: 'CCLEANER.EXE-99887766.pf', mtimeMs: NOW - 5 * H },
      { name: 'USBOBLIVION64.EXE-ABCDEF01.pf', mtimeMs: NOW - 30 * 60 * 1000 }
    ], NOW)
    expect(out).toEqual([
      `${TRACE_PREFIX} USB Oblivion was run 2026-09-27 13:30 UTC (30 min ago)`,
      `${TRACE_PREFIX} CCleaner was run 2026-09-27 12:00 UTC (2 h ago)`
    ])
  })
  it('ignores runs outside the window and unrelated programs', () => {
    expect(assessCleanerRuns([
      { name: 'CCLEANER64.EXE-1A2B3C4D.pf', mtimeMs: NOW - CLEANER_WINDOW_MS - H },
      { name: 'NOTEPAD.EXE-12345678.pf', mtimeMs: NOW }
    ], NOW)).toEqual([])
  })
})

describe('event log clears', () => {
  const xml = (iso: string) =>
    `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><Provider Name='Microsoft-Windows-Eventlog'/>` +
    `<EventID>104</EventID><TimeCreated SystemTime='${iso}'/></System></Event>`

  it('parses every TimeCreated in wevtutil XML output', () => {
    expect(parseEventTimes(xml('2026-09-27T12:00:00.1234567Z') + xml('2026-09-20T08:00:00Z'))).toEqual([
      Date.parse('2026-09-27T12:00:00.123Z'), Date.parse('2026-09-20T08:00:00Z')
    ])
    expect(parseEventTimes('')).toEqual([])
  })

  it('reports the most recent clear per log inside the window', () => {
    const out = assessLogClears([NOW - 48 * H, NOW - 2 * H], [NOW - 3 * H], NOW)
    expect(out).toEqual([
      `${TRACE_PREFIX} A Windows event log was cleared 2026-09-27 12:00 UTC (2 h ago)`,
      `${TRACE_PREFIX} The Security audit log was cleared 2026-09-27 11:00 UTC (3 h ago)`
    ])
  })

  it('ignores clears older than the window', () => {
    expect(assessLogClears([NOW - LOG_CLEAR_WINDOW_MS - H], [], NOW)).toEqual([])
  })
})

describe('formatWhen', () => {
  it('renders UTC time with a coarse relative age', () => {
    expect(formatWhen(NOW - 5 * 60 * 1000, NOW)).toBe('2026-09-27 13:55 UTC (5 min ago)')
    expect(formatWhen(NOW - 3 * 24 * H, NOW)).toBe('2026-09-24 14:00 UTC (3 days ago)')
  })
})
