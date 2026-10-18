import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '', isPackaged: false, getVersion: () => '3.2.1' } }))

import { ProblemReportService } from './problem-report-service'

const payload = { kind: 'scanner' as const, title: 'Registry scanner hangs', details: 'It stays on 40% for minutes.' }
const make = (fetchImpl: typeof fetch) =>
  new ProblemReportService({ baseUrl: 'https://site.test', appVersion: '3.2.1', system: () => ({ os: 'Windows 11', arch: 'x64' }), fetchImpl })

describe('ProblemReportService', () => {
  it('posts what the person wrote with the app version and system, and nothing else', async () => {
    let sent: { url: string; body: Record<string, unknown> } | null = null
    const f = vi.fn(async (url: URL, init: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init.body)) }
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    expect(await make(f).send({ ...payload, failedScanners: ['Registry Scanner'] })).toEqual({ ok: true })
    expect(sent!.url).toBe('https://site.test/api/desktop/problem')
    expect(sent!.body).toMatchObject({ app: 'custos', appVersion: '3.2.1', kind: 'scanner', title: payload.title })
    expect(sent!.body.context).toEqual({ os: 'Windows 11', arch: 'x64', failedScanners: ['Registry Scanner'] })
  })

  it('cuts Windows account names, e-mails and secrets out of the text', async () => {
    let body = ''
    const f = (async (_u: URL, init: RequestInit) => { body = String(init.body); return new Response(null, { status: 204 }) }) as unknown as typeof fetch
    await make(f).send({ ...payload, details: 'See C:\\Users\\Ivan\\AppData, mail ivan@example.com, token=abc123secret ok' })
    expect(body).not.toMatch(/Ivan|ivan@|abc123secret/)
  })

  it('refuses a malformed payload without sending, and maps site errors', async () => {
    const f = vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch
    expect(await make(f).send({ ...payload, extra: 1 })).toEqual({ ok: false, error: 'invalid' })
    expect(await make(f).send({ ...payload, title: 'ab' })).toEqual({ ok: false, error: 'invalid' })
    expect(f).not.toHaveBeenCalled()
    expect(await make(f).send(payload)).toEqual({ ok: false, error: 'rate_limited' })
    const down = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await make(down).send(payload)).toEqual({ ok: false, error: 'failed' })
  })
})
