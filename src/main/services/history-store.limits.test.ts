import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HistoryStore } from './history-store'
import type { ScanReport } from '../../shared/types'

const rep = (id: string, scannedAt: string): ScanReport => ({
  id, meta: { appVersion: '3', engineVersion: '1.2.0', scannedAt, durationMs: 1, gameId: null, signatureVersion: 'b' },
  verdict: { score: 0, band: 'clean', rationale: '', reasons: [] }, findings: [], correlations: [], scanners: []
})

let dir: string
let store: HistoryStore
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'custos-hist-')); store = new HistoryStore(dir) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('HistoryStore retention', () => {
  it('keeps every report beyond the former 100-check limit across a restart', async () => {
    const total = 105
    for (let i = 0; i < total; i++) {
      await store.save(rep(`s${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()), [])
    }
    const rows = await new HistoryStore(dir).list()
    expect(rows).toHaveLength(total)
    expect(rows[0].id).toBe(`s${total - 1}`)
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
    expect(files).toHaveLength(total)
    expect((await store.get('s0'))?.id).toBe('s0')
  })

  it('keeps an older report without pushing out newer ones', async () => {
    for (let i = 0; i < 100; i++) await store.save(rep(`n${i}`, new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString()), [])
    await store.save(rep('old', '2020-01-01T00:00:00Z'), [])
    const ids = (await store.list()).map((s) => s.id)
    expect(ids).toHaveLength(101)
    expect(ids.at(-1)).toBe('old')
    expect((await store.get('old'))?.id).toBe('old')
  })

  it('refuses ids that could leave the folder, and never throws on get', async () => {
    for (const id of ['../x', '..\\x', 'a/b', '', 'x'.repeat(81), 'C:\\x', 'a.b']) {
      expect(await store.get(id), id).toBeNull()
      await expect(store.remove(id)).rejects.toThrow()
    }
  })
})
