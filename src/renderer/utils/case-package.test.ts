// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'
import i18next, { type TFunction } from 'i18next'
import en from '../i18n/en.json'
import type { AnalyzedFinding, ScanReport } from '../../shared/types'
import type { HistoryEntry } from '../../shared/history'
import { crc32, makeZip } from './zip'
import { buildCasePackage, sha256Hex } from './case-package'

let t: TFunction

beforeAll(async () => {
  const inst = i18next.createInstance()
  await inst.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false }
  })
  t = inst.t.bind(inst) as TFunction
})

/** Read a stored zip back: names, bytes and checks (signatures, sizes, CRCs). */
function readZip(zip: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const crc = v.getUint32(at + 16, true)
    const size = v.getUint32(at + 24, true)
    const nameLen = v.getUint16(at + 28, true)
    const local = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = zip.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out.set(name, data)
    at += 46 + nameLen
  }
  return out
}

const finding = (
  id: string,
  value: string,
  over: Partial<AnalyzedFinding> = {}
): AnalyzedFinding => ({
  id,
  scannerId: 'appdata',
  value,
  category: 'file',
  matched: 'undead',
  severity: 'high',
  baseSeverity: 'high',
  confidence: 'low',
  baseConfidence: 'low',
  correlationId: null,
  reasons: [],
  ...over
})
const entry = (id: string, at: string, findings: AnalyzedFinding[], notes = ''): HistoryEntry => ({
  id,
  savedAt: at,
  report: {
    id,
    meta: {
      appVersion: '3',
      engineVersion: '1.2.0',
      scannedAt: at,
      durationMs: 1,
      gameId: 'unturned',
      signatureVersion: 'b'
    },
    verdict: {
      score: findings.length ? 70 : 0,
      band: findings.length ? 'high' : 'clean',
      rationale: '',
      reasons: []
    },
    findings,
    correlations: [],
    scanners: [],
    contentHash: 'a'.repeat(64)
  } as ScanReport,
  results: [],
  case: { player: 'Neo (76561198012345678)', notes }
})

describe('zip', () => {
  it('has the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips names (UTF-8) and bytes', () => {
    const files = [
      { name: 'a.txt', data: new TextEncoder().encode('hello') },
      { name: 'папка/файл.txt', data: new Uint8Array([0, 1, 2, 255]) },
      { name: 'empty', data: new Uint8Array() }
    ]
    const back = readZip(makeZip(files, new Date(2026, 9, 15, 21, 48, 10)))
    expect([...back.keys()]).toEqual(files.map((x) => x.name))
    expect([...back.get('папка/файл.txt')!]).toEqual([0, 1, 2, 255])
    expect(new TextDecoder().decode(back.get('a.txt')!)).toBe('hello')
  })
})

describe('case package', () => {
  const entries = [
    entry(
      'c1',
      '2026-10-15T10:00:00Z',
      [finding('1', 'C:\\Users\\p\\AppData\\Roaming\\undead')],
      'He said he is clean.'
    ),
    entry('c2', '2026-10-15T10:20:00Z', [])
  ]

  it('holds every check (html + json), a summary, a readme and a manifest that matches the files', async () => {
    const pkg = await buildCasePackage({
      t,
      entries,
      locale: 'en',
      checkedBy: 'dybeky',
      now: new Date('2026-10-15T11:00:00Z')
    })
    expect(pkg.fileName).toBe('custos-case-Neo_76561198012345678-2026-10-15.zip')
    const files = readZip(pkg.bytes)
    expect([...files.keys()]).toEqual(pkg.files)
    expect(pkg.files).toEqual(
      expect.arrayContaining(['README.txt', 'SUMMARY.txt', 'MANIFEST.sha256'])
    )
    expect(pkg.files.filter((n) => n.endsWith('.html'))).toHaveLength(2)
    expect(pkg.files.filter((n) => n.endsWith('.json'))).toHaveLength(2)

    // The manifest lists every other file, and every hash is the real one.
    const manifest = new TextDecoder().decode(files.get('MANIFEST.sha256')!).trim().split('\n')
    expect(manifest).toHaveLength(pkg.files.length - 1)
    for (const line of manifest) {
      const [hash, name] = [line.slice(0, 64), line.slice(66)]
      expect(line.slice(64, 66)).toBe(' *')
      expect(hash).toBe(createHash('sha256').update(files.get(name)!).digest('hex'))
    }
  })

  it('the summary says what was cleaned between the checks', async () => {
    const pkg = await buildCasePackage({
      t,
      entries,
      locale: 'en',
      now: new Date('2026-10-15T11:00:00Z')
    })
    const summary = new TextDecoder().decode(readZip(pkg.bytes).get('SUMMARY.txt')!)
    expect(summary).toContain('Neo (76561198012345678)')
    expect(summary).toContain('#1  15 Oct 2026')
    expect(summary).toContain('He said he is clean.')
    expect(summary).toContain('[#.] CLEANED')
    expect(summary).toContain('a'.repeat(64))
  })

  it('sha256Hex matches node', async () => {
    const data = new TextEncoder().encode('custos')
    expect(await sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'))
  })
})
