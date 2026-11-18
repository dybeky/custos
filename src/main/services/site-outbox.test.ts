import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SiteOutbox, drainOutbox, trackUpload } from './site-outbox'
import type { SiteUploadResult } from '../../shared/types'

const KEY = 'a'.repeat(64)
const entry = (over = {}) => ({ syncKey: KEY, player: 'Bob', notes: 'n', checker: 'me', ...over })

let dir: string
let file: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'outbox-'))
  file = join(dir, 'site-outbox.json')
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('SiteOutbox', () => {
  it('survives a restart: what was queued is read back from disk, with its key', async () => {
    const a = new SiteOutbox(file)
    await a.put('scan1', entry({ via: 'public' }))
    const b = new SiteOutbox(file)
    await b.load()
    expect(b.get('scan1')).toMatchObject({ syncKey: KEY, via: 'public', player: 'Bob' })
  })

  it('removes a sent check from disk too', async () => {
    const a = new SiteOutbox(file)
    await a.put('scan1', entry())
    await a.remove('scan1')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({})
  })

  it('keeps the place in line when the same check is queued again', async () => {
    let t = 1000
    const a = new SiteOutbox(file, () => t)
    await a.put('first', entry())
    t = 2000
    await a.put('second', entry())
    t = 3000
    await a.put('first', entry({ notes: 'edited' }))
    expect(a.entries().map(([id]) => id)).toEqual(['first', 'second'])
    expect(a.get('first')?.notes).toBe('edited')
  })

  it('retains every unsent report beyond 100 entries and after a month offline', async () => {
    let t = 1_000_000_000_000
    const a = new SiteOutbox(file, () => t)
    for (let i = 0; i <= 100; i++) {
      t += 1
      await a.put(`s${i}`, entry())
    }
    expect(a.entries()).toHaveLength(101)
    expect(a.get('s0')).toBeDefined()

    const later = new SiteOutbox(file, () => t + 90 * 24 * 3600 * 1000)
    await later.load()
    expect(later.entries()).toHaveLength(101)
  })

  it('starts empty on a damaged file or malformed rows instead of failing', async () => {
    await writeFile(file, '{not json', 'utf8')
    const a = new SiteOutbox(file)
    await a.load()
    expect(a.entries()).toEqual([])

    await writeFile(file, JSON.stringify({ ok_1: { ...entry(), queuedAt: Date.now() }, bad: { syncKey: 'x' }, '../evil': { ...entry(), queuedAt: Date.now() } }), 'utf8')
    const b = new SiteOutbox(file)
    await b.load()
    expect(b.entries().map(([id]) => id)).toEqual(['ok_1'])
  })
})

describe('drainOutbox', () => {
  const fill = async (ids: string[]) => {
    let t = 1000
    const o = new SiteOutbox(file, () => t++)
    for (const id of ids) await o.put(id, entry())
    return o
  }
  const res = (r: Partial<SiteUploadResult>): SiteUploadResult => ({ ok: false, ...r })

  it('sends everything oldest first once the site is back', async () => {
    const o = await fill(['a', 'b', 'c'])
    const order: string[] = []
    const out = await drainOutbox(o, async (id) => { order.push(id); return res({ ok: true }) })
    expect(order).toEqual(['a', 'b', 'c'])
    expect(out).toEqual({ sent: 3, left: 0 })
  })

  it('stops at the first passing failure and keeps the rest', async () => {
    const o = await fill(['a', 'b', 'c'])
    const seen: string[] = []
    const out = await drainOutbox(o, async (id) => {
      seen.push(id)
      return id === 'a' ? res({ ok: true }) : res({ error: 'network' })
    })
    expect(seen).toEqual(['a', 'b'])
    expect(out).toEqual({ sent: 1, left: 2 })
  })

  it('keeps a check waiting for an update or a sign-in, and drops one the site will never take', async () => {
    const o = await fill(['upd', 'big'])
    await drainOutbox(o, async () => res({ error: 'update_required' }))
    expect(o.entries().map(([id]) => id)).toEqual(['upd', 'big'])

    const out = await drainOutbox(o, async (id) => (id === 'upd' ? res({ error: 'too_large' }) : res({ error: 'not_found' })))
    expect(out).toEqual({ sent: 0, left: 0 })
  })
})

describe('trackUpload', () => {
  const r = (x: Partial<SiteUploadResult>): SiteUploadResult => ({ ok: false, ...x })

  it('queues a check the site did not get because it was unreachable, and clears it once sent', async () => {
    const o = new SiteOutbox(file)
    await trackUpload(o, 's1', r({ error: 'network' }), entry())
    await trackUpload(o, 's2', r({ error: 'HTTP 502' }), entry())
    await trackUpload(o, 's3', r({ error: 'update_required' }), entry())
    expect(o.entries().map(([id]) => id)).toEqual(['s1', 's2', 's3'])

    await trackUpload(o, 's1', r({ ok: true }), entry())
    expect(o.get('s1')).toBeUndefined()
  })

  it('does not queue what the site will never accept', async () => {
    const o = new SiteOutbox(file)
    await trackUpload(o, 's1', r({ error: 'too_large' }), entry())
    await trackUpload(o, 's2', r({ error: 'invalid_report' }), entry())
    expect(o.entries()).toEqual([])
  })
})
