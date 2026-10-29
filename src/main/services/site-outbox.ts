import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { isPassingUploadError } from '../../shared/site-upload'
import type { SiteUploadResult } from '../../shared/types'

/** A check that could not reach the site yet, with what is needed to send it again. */
export interface OutboxEntry {
  /** Secret of the check's public upload: the same one every time, so a re-send never makes a second row. */
  syncKey: string
  via?: 'account' | 'public'
  player: string
  notes: string
  checker: string
  queuedAt: number
}

/** Checks the site has not received (it was down, or there was no network). Kept longer than that is pointless. */
export const OUTBOX_LIMIT = 100
export const OUTBOX_MAX_AGE_MS = 30 * 24 * 3600 * 1000

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/
const isEntry = (v: unknown): v is OutboxEntry => {
  const e = v as OutboxEntry
  return !!e && typeof e.syncKey === 'string' && /^[0-9a-f]{64}$/.test(e.syncKey) &&
    typeof e.player === 'string' && typeof e.notes === 'string' && typeof e.checker === 'string' &&
    Number.isFinite(e.queuedAt) && (e.via === undefined || e.via === 'account' || e.via === 'public')
}

/**
 * The checks waiting for the site, kept on disk (userData/site-outbox.json) so
 * they survive closing the app. The check itself stays in history; this holds
 * only the way to send it again. Writes are atomic, like history.
 */
export class SiteOutbox {
  private rows = new Map<string, OutboxEntry>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private file: string, private now: () => number = Date.now) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Record<string, unknown>
      for (const [id, e] of Object.entries(parsed)) {
        if (ID_RE.test(id) && isEntry(e) && this.now() - e.queuedAt < OUTBOX_MAX_AGE_MS) this.rows.set(id, e)
      }
    } catch {
      // no file yet, or a damaged one: start empty (the checks are still in history)
    }
  }

  /** Oldest first. */
  entries(): Array<[string, OutboxEntry]> {
    return [...this.rows].sort((a, b) => a[1].queuedAt - b[1].queuedAt)
  }

  get(id: string): OutboxEntry | undefined {
    return this.rows.get(id)
  }

  put(id: string, entry: Omit<OutboxEntry, 'queuedAt'>): Promise<void> {
    // A later edit of the same check keeps its place in the line.
    this.rows.set(id, { ...entry, queuedAt: this.rows.get(id)?.queuedAt ?? this.now() })
    while (this.rows.size > OUTBOX_LIMIT) this.rows.delete(this.entries()[0][0])
    return this.persist()
  }

  remove(id: string): Promise<void> {
    return this.rows.delete(id) ? this.persist() : Promise.resolve()
  }

  private persist(): Promise<void> {
    const run = this.queue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, JSON.stringify(Object.fromEntries(this.rows)), 'utf8')
      await rename(tmp, this.file)
    })
    this.queue = run.catch(() => {})
    return run
  }
}

/** After a send: a check the site did not get for a passing reason waits in the outbox; anything else leaves it. */
export function trackUpload(outbox: SiteOutbox, id: string, result: SiteUploadResult, entry: Omit<OutboxEntry, 'queuedAt'>): Promise<void> {
  return !result.ok && isPassingUploadError(result.error) ? outbox.put(id, entry) : outbox.remove(id)
}

/**
 * Send what is waiting, oldest first. Stops at the first passing failure (the
 * site is still down: no point asking again for every check). A check the site
 * will never accept, or that is gone from history, is dropped.
 */
export async function drainOutbox(
  outbox: SiteOutbox,
  send: (id: string, entry: OutboxEntry) => Promise<SiteUploadResult>
): Promise<{ sent: number; left: number }> {
  let sent = 0
  for (const [id, entry] of outbox.entries()) {
    const res = await send(id, entry)
    if (res.ok) {
      sent++
      await outbox.remove(id)
    } else if (!isPassingUploadError(res.error)) {
      await outbox.remove(id)
    } else {
      break
    }
  }
  return { sent, left: outbox.entries().length }
}
