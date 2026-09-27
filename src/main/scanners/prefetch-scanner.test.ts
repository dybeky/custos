import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PrefetchScanner } from './prefetch-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'
import type { AppConfig, ScanSettings } from '../services/config-service'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'custos-pf-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function scanner(): PrefetchScanner {
  const config = { paths: { windows: { prefetchPath: dir } } } as unknown as AppConfig
  return new PrefetchScanner(
    new KeywordMatcher({ patterns: ['undead'], exactMatch: [] }),
    { excludedDirectories: [] } as unknown as ScanSettings,
    config
  )
}

describe('PrefetchScanner', () => {
  it('reports matching prefetch files with their last-run time', async () => {
    const hit = join(dir, 'UNDEAD.EXE-1A2B3C4D.pf')
    writeFileSync(hit, 'x')
    writeFileSync(join(dir, 'NOTEPAD.EXE-12345678.pf'), 'x')
    const when = new Date('2026-09-27T12:30:00Z')
    utimesSync(hit, when, when)

    const res = await scanner().scan()

    expect(res.success).toBe(true)
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0]).toMatch(/^.*UNDEAD\.EXE-1A2B3C4D\.pf \| last run 27\/09\/2026, \d{2}:\d{2}$/)
  })

  it('returns no findings when the folder is missing', async () => {
    rmSync(dir, { recursive: true, force: true })
    expect((await scanner().scan()).findings).toEqual([])
  })
})
