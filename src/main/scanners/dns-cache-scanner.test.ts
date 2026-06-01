import { describe, it, expect } from 'vitest'
import { DnsCacheScanner } from './dns-cache-scanner'
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

function makeScanner(): DnsCacheScanner {
  const matcher = new KeywordMatcher({ patterns: [], exactMatch: [] })
  return new DnsCacheScanner(matcher, minimalSettings)
}

// Real Windows `ipconfig /displaydns` (EN locale) uses an alternating dot-space
// leader: "Record Name . . . . . : value". The parser must handle that exact
// format — these fixtures use it verbatim.

const ENGLISH_SINGLE_A_RECORD = `
    Windows IP Configuration

    Record Name . . . . . : example.com
    Record Type . . . . . : 1
    Time To Live  . . . . : 300
    Data Length . . . . . : 4
    Section . . . . . . . : Answer
    A (Host) Record . . . : 93.184.216.34

`

const ENGLISH_MULTI_RECORD = `
    Windows IP Configuration

    Record Name . . . . . : google.com
    Record Type . . . . . : 1
    Time To Live  . . . . : 254
    Data Length . . . . . : 4
    Section . . . . . . . : Answer
    A (Host) Record . . . : 142.250.80.46

    Record Name . . . . . : github.com
    Record Type . . . . . : 28
    Time To Live  . . . . : 60
    Data Length . . . . . : 16
    Section . . . . . . . : Answer
    AAAA Record . . . . . : 2606:50c0:8000::153

    Record Name . . . . . : api.example.org
    Record Type . . . . . : 5
    Time To Live  . . . . : 120
    Data Length . . . . . : 8
    Section . . . . . . . : Answer
    CNAME Record  . . . . : origin.example.org

`

const ENGLISH_CNAME_RECORD = `
    Record Name . . . . . : cdn.cloudflare.net
    Record Type . . . . . : 5
    Time To Live  . . . . : 86400
    Data Length . . . . . : 12
    Section . . . . . . . : Answer
    CNAME Record  . . . . : cdn-lb.cloudflare.net

`

const RUSSIAN_RECORD = `
    Параметры настройки протокола Windows IP

    Имя записи.....: yandex.ru
    Тип записи.....: 1
    Срок жизни.....: 100
    Длина данных...: 4

`

describe('DnsCacheScanner.parseDnsOutput', () => {
  const scanner = makeScanner()

  it('parses a single English A record', () => {
    const entries = scanner.parseDnsOutput(ENGLISH_SINGLE_A_RECORD)
    const entry = entries.find(e => e.recordName === 'example.com')
    expect(entry).toBeDefined()
    expect(entry!.recordType).toBe('A')
    expect(entry!.ttl).toBe(300)
  })

  it('parses multiple records from a multi-entry output', () => {
    const entries = scanner.parseDnsOutput(ENGLISH_MULTI_RECORD)
    // Should have at least 3 entries: google.com, github.com, api.example.org
    const names = entries.map(e => e.recordName)
    expect(names).toContain('google.com')
    expect(names).toContain('github.com')
    expect(names).toContain('api.example.org')
  })

  it('assigns the correct record type for each parsed entry', () => {
    const entries = scanner.parseDnsOutput(ENGLISH_MULTI_RECORD)
    const google = entries.find(e => e.recordName === 'google.com')
    const github = entries.find(e => e.recordName === 'github.com')
    const api = entries.find(e => e.recordName === 'api.example.org')

    expect(google?.recordType).toBe('A')
    expect(github?.recordType).toBe('AAAA')
    expect(api?.recordType).toBe('CNAME')
  })

  it('assigns the correct TTL for each parsed entry', () => {
    const entries = scanner.parseDnsOutput(ENGLISH_MULTI_RECORD)
    const google = entries.find(e => e.recordName === 'google.com')
    const github = entries.find(e => e.recordName === 'github.com')
    const api = entries.find(e => e.recordName === 'api.example.org')

    expect(google?.ttl).toBe(254)
    expect(github?.ttl).toBe(60)
    expect(api?.ttl).toBe(120)
  })

  it('parses a CNAME record', () => {
    const entries = scanner.parseDnsOutput(ENGLISH_CNAME_RECORD)
    const entry = entries.find(e => e.recordName === 'cdn.cloudflare.net')
    expect(entry).toBeDefined()
    expect(entry!.recordType).toBe('CNAME')
    expect(entry!.ttl).toBe(86400)
  })

  it('parses a Russian-locale DNS record', () => {
    const entries = scanner.parseDnsOutput(RUSSIAN_RECORD)
    const entry = entries.find(e => e.recordName === 'yandex.ru')
    expect(entry).toBeDefined()
    expect(entry!.recordType).toBe('A')
    expect(entry!.ttl).toBe(100)
  })

  it('returns an empty array for empty input', () => {
    expect(scanner.parseDnsOutput('')).toEqual([])
  })

  it('returns an empty array for input with no recognizable records', () => {
    const noRecords = 'Windows IP Configuration\n\nSome random text\n'
    expect(scanner.parseDnsOutput(noRecords)).toEqual([])
  })
})

describe('DnsCacheScanner.dnsTypeToString', () => {
  const scanner = makeScanner()

  it('maps type 1 to A', () => {
    expect(scanner.dnsTypeToString(1)).toBe('A')
  })

  it('maps type 5 to CNAME', () => {
    expect(scanner.dnsTypeToString(5)).toBe('CNAME')
  })

  it('maps type 28 to AAAA', () => {
    expect(scanner.dnsTypeToString(28)).toBe('AAAA')
  })

  it('maps type 33 to SRV', () => {
    expect(scanner.dnsTypeToString(33)).toBe('SRV')
  })

  it('returns the number as a string for unknown types', () => {
    expect(scanner.dnsTypeToString(99)).toBe('99')
    expect(scanner.dnsTypeToString(15)).toBe('15')
  })
})
