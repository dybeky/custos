import { describe, it, expect } from 'vitest'
import { NewsService } from './news-service'

const ITEM = {
  id: 'pro-closed-beta',
  date: '2026-10-15',
  tag: 'pro',
  title: 'Custos Pro is in closed beta',
  summary: 'A new app.'
}

function site(
  body: unknown,
  status = 200,
  calls: { n: number; url?: string } = { n: 0 }
): typeof fetch {
  return (async (url: URL | string) => {
    calls.n++
    calls.url = String(url)
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
}

describe('NewsService', () => {
  it('reads the site feed and points at the news page', async () => {
    const calls = { n: 0 } as { n: number; url?: string }
    const svc = new NewsService({
      baseUrl: 'https://97437.dev',
      appVersion: '3.2.0',
      fetchImpl: site({ items: [ITEM] }, 200, calls)
    })
    const feed = await svc.get()
    expect(calls.url).toBe('https://97437.dev/api/news')
    expect(feed.items).toEqual([ITEM])
    expect(feed.url).toBe('https://97437.dev/news')
  })

  it('asks once, then serves the cached news until it is stale', async () => {
    let t = 0
    const calls = { n: 0 }
    const svc = new NewsService({
      baseUrl: 'https://97437.dev',
      appVersion: '3.2.0',
      fetchImpl: site({ items: [ITEM] }, 200, calls),
      now: () => t
    })
    await svc.get()
    await svc.get()
    expect(calls.n).toBe(1)
    t = 11 * 60 * 1000
    await svc.get()
    expect(calls.n).toBe(2)
  })

  it('shares one request between concurrent callers', async () => {
    const calls = { n: 0 }
    const svc = new NewsService({
      baseUrl: 'https://97437.dev',
      appVersion: '3.2.0',
      fetchImpl: site({ items: [ITEM] }, 200, calls)
    })
    await Promise.all([svc.get(), svc.get(), svc.get()])
    expect(calls.n).toBe(1)
  })

  it('shows nothing offline, and keeps the last news if the site then fails', async () => {
    const off = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(
      (await new NewsService({ baseUrl: 'https://x.dev', appVersion: '1', fetchImpl: off }).get())
        .items
    ).toEqual([])

    let t = 0
    let ok = true
    const flaky = (async () => {
      if (!ok) throw new Error('down')
      return new Response(JSON.stringify({ items: [ITEM] }))
    }) as unknown as typeof fetch
    const svc = new NewsService({
      baseUrl: 'https://x.dev',
      appVersion: '1',
      fetchImpl: flaky,
      now: () => t
    })
    expect((await svc.get()).items).toHaveLength(1)
    ok = false
    t = 60 * 60 * 1000
    expect((await svc.get()).items).toHaveLength(1)
  })

  it('ignores a malformed or oversized answer', async () => {
    for (const body of [
      'not json',
      { items: [{ ...ITEM, tag: 'ads' }] },
      { items: [{ ...ITEM, title: 'x'.repeat(500) }] },
      { nope: true },
      'x'.repeat(300_000)
    ]) {
      const svc = new NewsService({
        baseUrl: 'https://x.dev',
        appVersion: '1',
        fetchImpl: site(body)
      })
      expect((await svc.get()).items).toEqual([])
    }
    const bad = new NewsService({
      baseUrl: 'https://x.dev',
      appVersion: '1',
      fetchImpl: site({ items: [ITEM] }, 500)
    })
    expect((await bad.get()).items).toEqual([])
  })
})
