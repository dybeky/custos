import { describe, it, expect } from 'vitest'
import { SteamBansService } from './steam-bans-service'

const A = '76561198012345678'
const BAN = {
  steamId: A,
  vacBans: 1,
  gameBans: 0,
  daysSinceLastBan: 90,
  vacBanned: true,
  communityBanned: false,
  economyBan: 'none'
}

const site = (body: unknown, status = 200, calls: { url?: string } = {}): typeof fetch =>
  (async (url: URL | string) => {
    calls.url = String(url)
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch

describe('SteamBansService', () => {
  it('asks the site for the accounts and returns their bans', async () => {
    const calls: { url?: string } = {}
    const svc = new SteamBansService({ baseUrl: 'https://97437.dev', fetchImpl: site({ bans: [BAN], exact: true }, 200, calls) })
    const r = await svc.get([A, A, 'junk'])
    expect(calls.url).toBe(`https://97437.dev/api/desktop/steam-bans?ids=${A}`)
    expect(r).toEqual({ ok: true, exact: true, bans: [BAN] })
  })

  it('makes no request when there is no valid SteamID', async () => {
    let called = false
    const svc = new SteamBansService({
      baseUrl: 'https://97437.dev',
      fetchImpl: (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch
    })
    expect(await svc.get(['nope'])).toEqual({ ok: true, exact: true, bans: [] })
    expect(called).toBe(false)
  })

  it('never throws: a failing, odd or offline site gives ok: false', async () => {
    const down = new SteamBansService({ baseUrl: 'https://97437.dev', fetchImpl: site({}, 503) })
    expect((await down.get([A])).ok).toBe(false)
    const odd = new SteamBansService({ baseUrl: 'https://97437.dev', fetchImpl: site({ bans: [{ steamId: 'x' }], exact: true }) })
    expect((await odd.get([A])).ok).toBe(false)
    const offline = new SteamBansService({
      baseUrl: 'https://97437.dev',
      fetchImpl: (async () => {
        throw new Error('offline')
      }) as unknown as typeof fetch
    })
    expect((await offline.get([A])).ok).toBe(false)
  })
})
