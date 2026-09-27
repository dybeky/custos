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

describe('HistoryStore', () => {
  it('saves, lists newest first, and loads a check', async () => {
    await store.save(rep('scan-1', '2026-09-20T10:00:00Z'), [])
    await store.save(rep('scan-2', '2026-09-27T10:00:00Z'), [])
    expect((await store.list()).map((s) => s.id)).toEqual(['scan-2', 'scan-1'])
    expect((await store.get('scan-1'))?.report.id).toBe('scan-1')
  })

  it('attaches case details and keeps them when the report is re-saved (triage)', async () => {
    await store.save(rep('scan-1', '2026-09-20T10:00:00Z'), [])
    const rows = await store.setCase('scan-1', { player: 'Neo (76561198012345678)', notes: 'n' })
    expect(rows[0].playerKey).toBe('steam:76561198012345678')
    await store.save(rep('scan-1', '2026-09-20T10:00:00Z'), [])
    expect((await store.get('scan-1'))?.case.player).toBe('Neo (76561198012345678)')
  })

  it('handles concurrent saves without losing index rows', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.save(rep(`s${i}`, `2026-09-${10 + i}T10:00:00Z`), [])))
    expect(await store.list()).toHaveLength(10)
  })

  it('deletes a check', async () => {
    await store.save(rep('scan-1', '2026-09-20T10:00:00Z'), [])
    expect(await store.remove('scan-1')).toEqual([])
    expect(await store.get('scan-1')).toBeNull()
    expect(readdirSync(dir)).toEqual(['index.json'])
  })

  it('rejects ids that could escape the folder', async () => {
    await expect(store.remove('../../evil')).rejects.toThrow(/Invalid history id/)
    expect(await store.get('..\\x')).toBeNull()
  })

  it('returns an empty list when nothing is saved or the index is corrupt', async () => {
    expect(await store.list()).toEqual([])
  })
})
