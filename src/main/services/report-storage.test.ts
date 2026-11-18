import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { preserveReports, reportStorageDir } from './report-storage'
import { HistoryStore } from './history-store'
import { SiteOutbox, drainOutbox } from './site-outbox'
import type { ScanReport } from '../../shared/types'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'custos-storage-test-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

const report: ScanReport = {
  id: 'offline-1', meta: { appVersion: '3.2.1', engineVersion: '1.2.0', scannedAt: '2026-10-01T12:00:00Z', durationMs: 1, gameId: null, signatureVersion: 'b' },
  verdict: { score: 0, band: 'clean', rationale: '', reasons: [] }, findings: [], correlations: [], scanners: []
}
const pending = { syncKey: 'a'.repeat(64), player: 'Neo', notes: 'offline report', checker: 'tester' }

describe('persistent reports and session cleanup', () => {
  it('rescues a previous session before cleanup, then retries with the same secret after restarting', async () => {
    const session = join(root, 'temp', 'custos-session-0123456789abcdef')
    const destination = reportStorageDir(join(root, 'appdata'))
    await new HistoryStore(join(session, 'history')).save(report, [])
    await new SiteOutbox(join(session, 'site-outbox.json')).put(report.id, pending)
    expect(preserveReports(session, destination)).toBe(true)
    // The actual session is gone; both stores must work from the persistent root.
    rmSync(session, { recursive: true, force: true })
    const history = new HistoryStore(join(destination, 'history'))
    const outbox = new SiteOutbox(join(destination, 'site-outbox.json'))
    await outbox.load()
    expect((await history.list()).map((r) => r.id)).toEqual([report.id])
    expect((await history.get(report.id))?.report).toEqual(report)
    expect(await drainOutbox(outbox, async (id, e) => {
      expect(id).toBe(report.id)
      expect(e.syncKey).toBe(pending.syncKey)
      expect((await history.get(id))?.report.id).toBe(id)
      return { ok: false, error: 'network' }
    })).toEqual({ sent: 0, left: 1 })
    const restarted = new SiteOutbox(join(destination, 'site-outbox.json'))
    await restarted.load()
    expect(await drainOutbox(restarted, async () => ({ ok: true }))).toEqual({ sent: 1, left: 0 })
    expect((await history.get(report.id))?.report).toEqual(report)
  })

  it('merges recovered files into an existing archive and makes them visible in its index', async () => {
    const destination = reportStorageDir(join(root, 'appdata'))
    const current = new HistoryStore(join(destination, 'history'))
    await current.save({ ...report, id: 'existing' }, [])
    const old = join(root, 'old')
    await new HistoryStore(join(old, 'history')).save(report, [])
    expect(preserveReports(old, destination)).toBe(true)
    expect((await current.list()).map((r) => r.id).sort()).toEqual(['existing', 'offline-1'])
  })

  it('refuses cleanup when an old queue cannot be read, retaining the source for recovery', () => {
    const old = join(root, 'old')
    mkdirSync(old)
    writeFileSync(join(old, 'site-outbox.json'), '{broken')
    expect(preserveReports(old, reportStorageDir(join(root, 'appdata')))).toBe(false)
  })
})
