import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { BrowserHistoryScanner, FIREFOX_HISTORY_QUERY } from './browser-history-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

const minimalSettings = {
  appDataScanDepth: 3,
  windowsScanDepth: 1,
  programFilesScanDepth: 2,
  userFoldersScanDepth: 3,
  recentFilesDays: 7,
  executableExtensions: ['.exe'],
  excludedDirectories: []
}

function makeScanner(): BrowserHistoryScanner {
  const matcher = new KeywordMatcher({ patterns: [], exactMatch: [] })
  return new BrowserHistoryScanner(matcher, minimalSettings)
}

describe('BrowserHistoryScanner.convertChromeTimestamp', () => {
  const scanner = makeScanner()

  it('converts a known Chrome timestamp to the correct UTC date (2020-01-01 00:00:00 UTC)', () => {
    // Chrome stores microseconds since 1601-01-01 UTC.
    // For 2020-01-01 00:00:00 UTC:
    //   Unix ms = 1577836800000
    //   Chrome ts = (1577836800000 + 11644473600000) * 1000 = 13222310400000000
    const chromeTs = 13222310400000000
    const date = scanner.convertChromeTimestamp(chromeTs)
    expect(date.getUTCFullYear()).toBe(2020)
    expect(date.getUTCMonth()).toBe(0)    // January
    expect(date.getUTCDate()).toBe(1)
    expect(date.getUTCHours()).toBe(0)
    expect(date.getUTCMinutes()).toBe(0)
    expect(date.getUTCSeconds()).toBe(0)
  })

  it('converts a Chrome timestamp for a recent date (2023-03-20 08:45:00 UTC)', () => {
    // Unix ms for 2023-03-20 08:45:00 UTC
    const d = new Date('2023-03-20T08:45:00Z')
    const chromeTs = (d.getTime() + 11644473600000) * 1000
    const result = scanner.convertChromeTimestamp(chromeTs)
    expect(result.getUTCFullYear()).toBe(2023)
    expect(result.getUTCMonth()).toBe(2)   // March
    expect(result.getUTCDate()).toBe(20)
    expect(result.getUTCHours()).toBe(8)
    expect(result.getUTCMinutes()).toBe(45)
  })

  it('returns epoch (Date(0)) for zero timestamp', () => {
    const result = scanner.convertChromeTimestamp(0)
    expect(result.getTime()).toBe(0)
  })

  it('returns epoch (Date(0)) for negative timestamp', () => {
    const result = scanner.convertChromeTimestamp(-1)
    expect(result.getTime()).toBe(0)
  })
})

describe('BrowserHistoryScanner.convertFirefoxTimestamp', () => {
  const scanner = makeScanner()

  it('converts a known Firefox timestamp to the correct UTC date (2020-01-01 00:00:00 UTC)', () => {
    // Firefox stores microseconds since the Unix epoch (1970-01-01).
    // For 2020-01-01 00:00:00 UTC:
    //   Unix ms = 1577836800000
    //   Firefox ts = 1577836800000 * 1000 = 1577836800000000
    const firefoxTs = 1577836800000000
    const date = scanner.convertFirefoxTimestamp(firefoxTs)
    expect(date.getUTCFullYear()).toBe(2020)
    expect(date.getUTCMonth()).toBe(0)
    expect(date.getUTCDate()).toBe(1)
    expect(date.getUTCHours()).toBe(0)
    expect(date.getUTCMinutes()).toBe(0)
    expect(date.getUTCSeconds()).toBe(0)
  })

  it('converts a Firefox timestamp for a specific time (2022-11-05 15:20:30 UTC)', () => {
    const d = new Date('2022-11-05T15:20:30Z')
    const firefoxTs = d.getTime() * 1000
    const result = scanner.convertFirefoxTimestamp(firefoxTs)
    expect(result.getUTCFullYear()).toBe(2022)
    expect(result.getUTCMonth()).toBe(10)  // November
    expect(result.getUTCDate()).toBe(5)
    expect(result.getUTCHours()).toBe(15)
    expect(result.getUTCMinutes()).toBe(20)
    expect(result.getUTCSeconds()).toBe(30)
  })

  it('returns epoch (Date(0)) for zero timestamp', () => {
    const result = scanner.convertFirefoxTimestamp(0)
    expect(result.getTime()).toBe(0)
  })

  it('returns epoch (Date(0)) for negative timestamp', () => {
    const result = scanner.convertFirefoxTimestamp(-100)
    expect(result.getTime()).toBe(0)
  })

  it('Chrome and Firefox timestamps for the same instant produce the same Date', () => {
    const d = new Date('2021-07-04T10:00:00Z')
    const chromeTs = (d.getTime() + 11644473600000) * 1000
    const firefoxTs = d.getTime() * 1000

    const chromeDate = scanner.convertChromeTimestamp(chromeTs)
    const firefoxDate = scanner.convertFirefoxTimestamp(firefoxTs)

    expect(chromeDate.getTime()).toBe(firefoxDate.getTime())
  })
})

describe('FIREFOX_HISTORY_QUERY', () => {
  it('returns each page once, with its latest visit', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run(`CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
      CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
      INSERT INTO moz_places VALUES (1, 'https://busy.example', 'Busy'), (2, 'https://aimbot.example', 'Aimbot'), (3, 'https://bookmark.example', NULL);
      INSERT INTO moz_historyvisits (place_id, visit_date) VALUES (1, 100), (1, 300), (1, 200), (2, 150);`)
    const rows = db.exec(FIREFOX_HISTORY_QUERY)[0].values
    db.close()
    expect(rows).toEqual([
      ['https://busy.example', 'Busy', 300],
      ['https://aimbot.example', 'Aimbot', 150],
      ['https://bookmark.example', null, null]
    ])
  })
})
