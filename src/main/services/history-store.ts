import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  HISTORY_LIMIT, summarize, type HistoryCase, type HistoryEntry, type HistorySummary
} from '../../shared/history'
import type { ScanReport, ScanResult } from '../../shared/types'

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/

/**
 * Saved checks on disk: one JSON file per check plus a small index of
 * summaries, under the app's user-data folder. Writes are atomic (temp file +
 * rename) so a crash never leaves a half-written check or index.
 */
export class HistoryStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private dir: string) {}

  /** Serialize all mutations so concurrent saves can't clobber the index. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  private file(id: string): string {
    if (!ID_RE.test(id)) throw new Error('Invalid history id')
    return join(this.dir, `${id}.json`)
  }

  private async writeAtomic(path: string, data: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify(data), 'utf8')
    await rename(tmp, path)
  }

  async list(): Promise<HistorySummary[]> {
    try {
      const parsed = JSON.parse(await readFile(join(this.dir, 'index.json'), 'utf8'))
      return Array.isArray(parsed) ? (parsed as HistorySummary[]) : []
    } catch {
      return []
    }
  }

  async get(id: string): Promise<HistoryEntry | null> {
    try {
      return JSON.parse(await readFile(this.file(id), 'utf8')) as HistoryEntry
    } catch {
      return null
    }
  }

  private async putIndex(summary: HistorySummary): Promise<HistorySummary[]> {
    const rows = (await this.list()).filter((s) => s.id !== summary.id)
    rows.push(summary)
    rows.sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))
    const kept = rows.slice(0, HISTORY_LIMIT)
    for (const dropped of rows.slice(HISTORY_LIMIT)) {
      await rm(this.file(dropped.id), { force: true }).catch(() => {})
    }
    await this.writeAtomic(join(this.dir, 'index.json'), kept)
    return kept
  }

  /** Save (or overwrite) a check; the case is kept if the entry already exists. */
  save(report: ScanReport, results: ScanResult[]): Promise<void> {
    return this.exclusive(async () => {
      const existing = await this.get(report.id)
      const entry: HistoryEntry = {
        id: report.id,
        savedAt: new Date().toISOString(),
        report,
        results,
        case: existing?.case ?? { player: '', notes: '' }
      }
      await this.writeAtomic(this.file(report.id), entry)
      await this.putIndex(summarize(entry))
    })
  }

  /** Attach player / notes to a saved check (a no-op if it no longer exists). */
  setCase(id: string, c: HistoryCase): Promise<HistorySummary[]> {
    return this.exclusive(async () => {
      const entry = await this.get(id)
      if (!entry) return this.list()
      entry.case = { player: c.player.slice(0, 200), notes: c.notes.slice(0, 5000) }
      await this.writeAtomic(this.file(id), entry)
      return this.putIndex(summarize(entry))
    })
  }

  remove(id: string): Promise<HistorySummary[]> {
    return this.exclusive(async () => {
      await rm(this.file(id), { force: true })
      const rows = (await this.list()).filter((s) => s.id !== id)
      await this.writeAtomic(join(this.dir, 'index.json'), rows)
      return rows
    })
  }
}
