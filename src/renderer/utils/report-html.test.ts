import { describe, it, expect, beforeAll } from 'vitest'
import i18next, { type TFunction } from 'i18next'
import en from '../i18n/en.json'
import type { ScanReport } from '../../shared/types'
import { buildHtmlReport, esc } from './report-html'

let t: TFunction

beforeAll(async () => {
  const inst = i18next.createInstance()
  await inst.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false }
  })
  t = inst.t
})

const evil = '<img src=x onerror=alert(1)>"&\''

const report: ScanReport = {
  id: 'scan-20260619-abcd',
  meta: {
    appVersion: '3.3.0',
    engineVersion: '1.1.0',
    scannedAt: '2026-06-19T10:00:00.000Z',
    durationMs: 12_345,
    gameId: 'unturned',
    signatureVersion: 'bundled-1',
    os: { name: 'Windows 11', version: '24H2', arch: 'x64', appArch: 'x64' }
  },
  verdict: {
    score: 72,
    band: 'high',
    rationale: 'r',
    reasons: [{ code: 'corroboration', direction: 'up', text: 'A signature was corroborated' }]
  },
  findings: [
    {
      id: 'a',
      scannerId: 'prefetch',
      value: `C:/Windows/Prefetch/${evil}.pf`,
      category: 'execution',
      matched: 'undead',
      severity: 'high',
      baseSeverity: 'high',
      confidence: 'medium',
      baseConfidence: 'low',
      correlationId: 'c1',
      reasons: []
    },
    {
      id: 'c',
      scannerId: 'steam',
      value: '[Steam Account] player1',
      category: 'context',
      matched: null,
      severity: 'info',
      baseSeverity: 'info',
      confidence: 'low',
      baseConfidence: 'low',
      correlationId: null,
      reasons: []
    },
    {
      id: 'd',
      scannerId: 'dnscache',
      value: '[DNS Cache] dismissed.example',
      category: 'network',
      matched: 'melony',
      severity: 'medium',
      baseSeverity: 'medium',
      confidence: 'low',
      baseConfidence: 'low',
      correlationId: null,
      reasons: [],
      dismissed: true
    }
  ],
  correlations: [
    {
      id: 'c1',
      signature: 'undead',
      categories: ['execution'],
      scannerIds: ['prefetch'],
      strength: 1,
      severity: 'medium',
      confidence: 'medium'
    }
  ],
  scanners: [
    { id: 'prefetch', name: 'Prefetch Scanner', success: true, durationMs: 40, count: 1 },
    {
      id: 'bam',
      name: 'BAM/DAM Scanner',
      success: false,
      error: `Access denied ${evil}`,
      durationMs: 3,
      count: 0
    }
  ],
  contentHash: 'f'.repeat(64)
}

describe('esc', () => {
  it('escapes the five HTML-significant characters and tolerates null', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
    expect(esc(null)).toBe('')
    expect(esc(72)).toBe('72')
  })
})

describe('buildHtmlReport', () => {
  let html = ''
  beforeAll(() => {
    html = buildHtmlReport(t, report, 'en-US', {
      player: 'Bob <b>',
      checkedBy: 'staff',
      notes: 'line1\nline2'
    })
  })

  it('is a complete document with the verdict, evidence, checks and integrity hash', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('scan-20260619-abcd')
    expect(html).toContain('72')
    expect(html).toContain('>High<')
    expect(html).toContain('undead')
    expect(html).toContain('Unturned')
    expect(html).toContain('[Steam Account] player1')
    expect(html).toContain('f'.repeat(64))
    expect(html).toContain('FAIL')
    expect(html).toContain('line1<br>line2')
  })

  it('leaves out suppressed findings', () => {
    expect(html).not.toContain('dismissed.example')
  })

  it('escapes everything that comes from the checked PC or the checker', () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Bob <b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('Bob &lt;b&gt;')
  })

  it('carries no script and no external resource, and forbids both by policy', () => {
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/(src|href)=["']https?:/i)
    expect(html).toContain("default-src 'none'")
  })

  it('leaves no untranslated keys or placeholders', () => {
    expect(html).not.toMatch(/\{\{|\bverdict\.|\breport\.|\bcase\./)
  })
})
