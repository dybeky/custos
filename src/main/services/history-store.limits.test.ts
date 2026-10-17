import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { HistoryStore } from './history-store'
import { HISTORY_LIMIT } from '../../shared/history'
import type { ScanReport } from '../../shared/types'

const rep = (id: string, scannedAt: string): ScanReport => ({
  id, meta: { appVersion: '3', engineVersion: '1.2.0', scannedAt, durationMs: 1, gameId: null, signatureVersion: 'b' },
  verdict: { score: 0, band: 'clean', rationale: '', reasons: [] }, findings: [], correlations: [], scanners: []
})

let dir: string
let store: HistoryStore
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'custos-hist-')); store = new HistoryStore(dir) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('HistoryStore limits', () => {
  it('keeps the newest HISTORY_LIMIT checks and deletes the files of the rest', async () => {
    const total = HISTORY_LIMIT + 5
    for (let i = 0; i < total; i++) {
      await store.save(rep(`s${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()), [])
    }
    const rows = await store.list()
    expect(rows).toHaveLength(HISTORY_LIMIT)
    expect(rows[0].id).toBe(`s${total - 1}`)
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
    expect(files).toHaveLength(HISTORY_LIMIT)
    expect(await store.get('s0')).toBeNull()
  })

  it('an old check saved after a full history does not push out newer ones', async () => {
    for (let i = 0; i < HISTORY_LIMIT; i++) await store.save(rep(`n${i}`, new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString()), [])
    await store.save(rep('old', '2020-01-01T00:00:00Z'), [])
    const ids = (await store.list()).map((s) => s.id)
    expect(ids).toHaveLength(HISTORY_LIMIT)
    expect(ids).not.toContain('old')
    expect(await store.get('old')).toBeNull()
  })

  it('refuses ids that could leave the folder, and never throws on get', async () => {
    for (const id of ['../x', '..\\x', 'a/b', '', 'x'.repeat(81), 'C:\\x', 'a.b']) {
      expect(await store.get(id), id).toBeNull()
      await expect(store.remove(id)).rejects.toThrow()
    }
  })
})
