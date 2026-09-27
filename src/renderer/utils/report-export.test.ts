import { describe, it, expect, beforeAll } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import en from '../i18n/en.json'
import ru from '../i18n/ru.json'
import type { ScanReport, ScanResult } from '../../shared/types'
import { buildTextReport, buildJsonReport, exportFileStem, REPORT_FORMAT } from './report-export'
import { reasonText, evidenceFindings, coverageReason, rankedCorrelations, buildTimeline, relativeToScan } from './report-view'

let tEn: TFunction
let tRu: TFunction

beforeAll(async () => {
  const mk = async (lng: string) => {
    const inst = i18next.createInstance()
    await inst.init({ lng, resources: { en: { translation: en }, ru: { translation: ru } }, interpolation: { escapeValue: false } })
    return inst.t
  }
  tEn = await mk('en')
  tRu = await mk('ru')
})

const now = new Date(0)
const result = (scannerName: string, findings: string[], success = true, error?: string): ScanResult => ({
  scannerName, success, findings, error, startTime: now, endTime: now, duration: 5, count: findings.length, hasFindings: findings.length > 0
})

const report: ScanReport = {
  id: 'scan-20260619-abcd',
  meta: {
    appVersion: '3.0.0', engineVersion: '1.1.0', scannedAt: '2026-06-19T10:00:00.000Z', durationMs: 12_345,
    gameId: 'unturned', signatureVersion: 'bundled-1',
    os: { name: 'Windows 11', version: '24H2', arch: 'x64', appArch: 'x64' }
  },
  verdict: {
    score: 72, band: 'high', rationale: 'A signature was corroborated across multiple artifacts',
    reasons: [
      { code: 'corroboration', direction: 'up', text: 'A signature was corroborated across multiple artifacts' },
      { code: 'incomplete-coverage', direction: 'neutral', text: '1 of 3 checks did not complete', params: { failed: 1, total: 3 } }
    ]
  },
  findings: [
    { id: 'a', scannerId: 'prefetch', value: 'C:\\Windows\\Prefetch\\UNDEAD.EXE-1234.pf', category: 'execution', matched: 'undead',
      severity: 'high', baseSeverity: 'high', confidence: 'medium', baseConfidence: 'low', correlationId: 'c1', reasons: [] },
    { id: 'b', scannerId: 'appdata', value: 'C:\\Users\\p\\AppData\\Roaming\\undead', category: 'file', matched: 'undead',
      severity: 'medium', baseSeverity: 'medium', confidence: 'medium', baseConfidence: 'low', correlationId: 'c1', reasons: [] },
    { id: 'c', scannerId: 'steam', value: '[Steam Account] player1 (SteamID: 76561198000000000)', category: 'context', matched: null,
      severity: 'info', baseSeverity: 'info', confidence: 'low', baseConfidence: 'low', correlationId: null, reasons: [] },
    { id: 'd', scannerId: 'dnscache', value: '[DNS Cache] melony.example', category: 'network', matched: 'melony',
      severity: 'medium', baseSeverity: 'medium', confidence: 'low', baseConfidence: 'low', correlationId: null, reasons: [], dismissed: true }
  ],
  correlations: [
    { id: 'c1', signature: 'undead', categories: ['execution', 'file'], scannerIds: ['prefetch', 'appdata'], strength: 2, severity: 'medium', confidence: 'medium' }
  ],
  scanners: [
    { id: 'prefetch', name: 'Prefetch Scanner', success: true, durationMs: 40, count: 1 },
    { id: 'appdata', name: 'AppData Scanner', success: true, durationMs: 1500, count: 1 },
    { id: 'bam', name: 'BAM/DAM Scanner', success: false, error: 'Access denied', durationMs: 3, count: 0 }
  ],
  contentHash: 'f'.repeat(64)
}

describe('report-view helpers', () => {
  it('localizes reasons by code with params, falling back to engine text', () => {
    expect(reasonText(tRu, report.verdict.reasons[1])).toContain('1 из 3')
    expect(reasonText(tEn, { code: 'unknown-code', direction: 'neutral', text: 'raw text' })).toBe('raw text')
  })
  it('counts only active, non-informational findings as evidence', () => {
    expect(evidenceFindings(report).map(f => f.id)).toEqual(['a', 'b'])
    expect(evidenceFindings(null)).toEqual([])
  })
  it('finds the coverage reason and ranks correlations', () => {
    expect(coverageReason(report)?.params).toEqual({ failed: 1, total: 3 })
    expect(rankedCorrelations(report)[0].signature).toBe('undead')
  })
})

describe('buildTextReport', () => {
  it('includes metadata, verdict, key evidence, graded findings, checks and integrity', () => {
    const txt = buildTextReport(tEn, report, [], 'en-US')
    expect(txt).toContain('CUSTOS — FORENSIC SCAN REPORT')
    expect(txt).toContain('scan-20260619-abcd')
    expect(txt).toContain('Unturned')
    expect(txt).toContain('Windows 11 24H2')
    expect(txt).toMatch(/RISK VERDICT: HIGH \(Risk score 72\/100\)/)
    expect(txt).toContain('KEY EVIDENCE')
    expect(txt).toContain('"undead" — seen in 2 artifact types')
    expect(txt).toContain('EVIDENCE (2)')
    expect(txt).toContain('UNDEAD.EXE-1234.pf')
    expect(txt).toContain('SYSTEM INFORMATION (1)')
    expect(txt).toContain('DISMISSED / WHITELISTED (1)')
    expect(txt).toContain('CHECKS (2/3)')
    expect(txt).toContain('[FAIL]')
    expect(txt).toContain('Access denied')
    expect(txt).toContain(`SHA-256 ${'f'.repeat(64)}`)
  })

  it('evidence precedes system information in the output', () => {
    const txt = buildTextReport(tEn, report, [])
    expect(txt.indexOf('UNDEAD.EXE')).toBeLessThan(txt.indexOf('[Steam Account]'))
  })

  it('is fully localized in Russian', () => {
    const txt = buildTextReport(tRu, report, [], 'ru-RU')
    expect(txt).toContain('ОТЧЁТ О КРИМИНАЛИСТИЧЕСКОЙ ПРОВЕРКЕ')
    expect(txt).toContain('ОЦЕНКА РИСКА: ВЫСОКИЙ')
    expect(txt).toContain('КЛЮЧЕВЫЕ УЛИКИ')
    expect(txt).not.toMatch(/\{\{|\bverdict\.|\breport\./)
  })

  it('falls back to raw results when no report is available', () => {
    const txt = buildTextReport(tEn, null, [result('AppData Scanner', ['C:/x/undead.exe']), result('Prefetch Scanner', [])])
    expect(txt).toContain('C:/x/undead.exe')
    expect(txt).toContain('No findings')
  })
})

describe('buildJsonReport', () => {
  it('wraps the full analyzed report and raw results in a versioned envelope', () => {
    const json = JSON.parse(buildJsonReport(report, [result('AppData Scanner', ['x'], true)], new Date(0)))
    expect(json.format).toBe(REPORT_FORMAT)
    expect(json.formatVersion).toBe(1)
    expect(json.exportedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(json.report.contentHash).toBe('f'.repeat(64))
    expect(json.report.verdict.band).toBe('high')
    expect(json.results[0]).toMatchObject({ scannerName: 'AppData Scanner', success: true, findings: ['x'] })
  })
})

describe('exportFileStem', () => {
  it('names exports by scan date and id', () => {
    expect(exportFileStem(report)).toBe('custos-2026-06-19-scan-20260619-abcd')
  })
  it('strips unsafe characters from the id', () => {
    expect(exportFileStem({ ...report, id: '../evil id' })).toBe('custos-2026-06-19-evilid')
  })
})

describe('buildTextReport formatting', () => {
  it('localizes duration units and omits confidence for informational items', () => {
    const ru = buildTextReport(tRu, report, [], 'ru-RU')
    expect(ru).toContain('12.3 с')
    expect(ru).toContain('[ИНФО] ')
    expect(buildTextReport(tEn, report, [])).toContain('12.3 s')
  })
})

describe('activity timeline', () => {
  const scanAt = Date.parse(report.meta.scannedAt)
  const timed: ScanReport = {
    ...report,
    findings: [
      { ...report.findings[0], id: 't1', observedAt: new Date(scanAt - 40 * 60_000).toISOString() },
      { ...report.findings[1], id: 't2', observedAt: new Date(scanAt - 3 * 24 * 60 * 60_000).toISOString() },
      { ...report.findings[2], id: 't3', observedAt: new Date(scanAt - 60_000).toISOString() }, // info → excluded
      { ...report.findings[3], id: 't4', observedAt: new Date(scanAt - 60_000).toISOString() } // dismissed → excluded
    ]
  }

  it('lists timestamped evidence newest first and flags the last 24 h', () => {
    const tl = buildTimeline(timed)
    expect(tl.map(e => e.finding.id)).toEqual(['t1', 't2'])
    expect(tl[0]).toMatchObject({ minutesBeforeScan: 40, recent: true })
    expect(tl[1].recent).toBe(false)
  })

  it('formats the time relative to the scan in both languages', () => {
    expect(relativeToScan(tEn, 40)).toBe('40 min before the scan')
    expect(relativeToScan(tEn, 180)).toBe('3 h before the scan')
    expect(relativeToScan(tRu, 3 * 24 * 60)).toBe('за 3 дня до проверки')
    expect(relativeToScan(tRu, 5 * 24 * 60)).toBe('за 5 дней до проверки')
  })

  it('is included in the text export', () => {
    const txt = buildTextReport(tEn, timed, [], 'en-GB')
    expect(txt).toContain('ACTIVITY TIMELINE')
    expect(txt).toContain('40 min before the scan')
  })
})
