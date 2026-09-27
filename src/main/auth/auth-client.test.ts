// src/main/auth/auth-client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AuthClient, SessionUnavailableError, UpdateRequiredError } from './auth-client'
import type { PublicUser } from '../../shared/types'

const BASE = 'http://localhost:3000'
const user: PublicUser = { id: 'u1', username: 'neo', uid: 7, avatarVersion: 3, role: 'admin', status: 'active' }

function mockFetch(handler: (url: string, init?: any) => any): typeof fetch {
  return vi.fn(async (url: any, init?: any) => handler(String(url), init)) as unknown as typeof fetch
}
const json = (body: any, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('AuthClient URL builders', () => {
  const c = new AuthClient(BASE)
  it('builds the start URL with encoded params', () => {
    const u = new URL(c.buildStartUrl('st@te', 'ch all', 'github'))
    expect(u.pathname).toBe('/desktop/auth/start')
    expect(u.searchParams.get('state')).toBe('st@te')
    expect(u.searchParams.get('cc')).toBe('ch all')
    expect(u.searchParams.get('provider')).toBe('github')
  })
  it('builds a stable id-based profile URL (web redirects it to the canonical handle)', () => {
    expect(c.buildProfileUrl(user)).toBe(`${BASE}/profile/id/u1`)
  })
  it('builds the public token-free avatar URL', () => {
    expect(c.avatarUrl(user)).toBe(`${BASE}/api/avatar/u1?v=3`)
  })
})

describe('AuthClient.exchange', () => {
  it('returns token + user on success', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ token: 'bearer-xyz', user })))
    const r = await c.exchange({ state: 's', code: 'g', codeVerifier: 'v' })
    expect(r.token).toBe('bearer-xyz')
    expect(r.user.username).toBe('neo')
    // image is normalized to the canonical, token-free avatar endpoint (§6.5)
    expect(r.user.image).toBe(`${BASE}/api/avatar/u1?v=3`)
  })
  it('throws on invalid_grant', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ error: 'invalid_grant' }, 400)))
    await expect(c.exchange({ state: 's', code: 'g', codeVerifier: 'v' })).rejects.toThrow(/invalid_grant/)
  })
})

describe('AuthClient.getSession', () => {
  it('returns user for an active session with a normalized avatar URL', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ user })))
    const s = await c.getSession('t')
    expect(s?.user.id).toBe('u1')
    expect(s?.user.image).toBe(`${BASE}/api/avatar/u1?v=3`)
  })
  it('returns null on 401', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({}, 401)))
    expect(await c.getSession('t')).toBeNull()
  })
  it('returns null for a banned account', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ user: { ...user, status: 'banned' } })))
    expect(await c.getSession('t')).toBeNull()
  })
  it('returns null on 403', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({}, 403)))
    expect(await c.getSession('t')).toBeNull()
  })
  it('throws SessionUnavailableError on 5xx / 429 instead of reporting an invalid session', async () => {
    for (const status of [500, 502, 503, 429]) {
      const c = new AuthClient(BASE, mockFetch(() => json({}, status)))
      await expect(c.getSession('t')).rejects.toBeInstanceOf(SessionUnavailableError)
    }
  })
  it('throws SessionUnavailableError on a network failure', async () => {
    const c = new AuthClient(BASE, mockFetch(() => { throw new TypeError('fetch failed') }))
    await expect(c.getSession('t')).rejects.toBeInstanceOf(SessionUnavailableError)
  })
  it('passes an abort signal so a stalled request cannot hang', async () => {
    let seen: RequestInit | undefined
    const c = new AuthClient(BASE, mockFetch((_u, init) => { seen = init; return json({ user }) }))
    await c.getSession('t')
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('AuthClient.pollDeviceToken', () => {
  it('maps pending / slow_down / token', async () => {
    expect((await new AuthClient(BASE, mockFetch(() => json({ error: 'authorization_pending' }, 400))).pollDeviceToken('d')).kind).toBe('pending')
    expect((await new AuthClient(BASE, mockFetch(() => json({ error: 'slow_down' }, 400))).pollDeviceToken('d')).kind).toBe('slow_down')
    const ok = await new AuthClient(BASE, mockFetch(() => json({ token: 'b', user }))).pollDeviceToken('d')
    expect(ok.kind).toBe('token')
  })
  it('maps expired and denied', async () => {
    expect((await new AuthClient(BASE, mockFetch(() => json({ error: 'expired_token' }, 400))).pollDeviceToken('d')).kind).toBe('expired')
    expect((await new AuthClient(BASE, mockFetch(() => json({ error: 'access_denied' }, 400))).pollDeviceToken('d')).kind).toBe('denied')
  })
})

describe('AuthClient.redact', () => {
  it('does not leak a bearer in a log string', () => {
    const c = new AuthClient(BASE)
    expect(c.redact('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi')
  })
})

describe('AuthClient site integration', () => {
  it('sends the app version on every request', async () => {
    let seen: any
    const c = new AuthClient(BASE, mockFetch((_u, init) => { seen = init; return json({ user }) }), '3.1.0')
    await c.getSession('tok')
    expect(new Headers(seen.headers).get('X-Custos-Version')).toBe('3.1.0')
  })

  it('maps 426 to UpdateRequiredError on exchange, me and uploads', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ error: 'update_required', minVersion: '4.0.0' }, 426)))
    await expect(c.exchange({ state: 's', code: 'c', codeVerifier: 'v' })).rejects.toMatchObject({ name: 'UpdateRequiredError', minVersion: '4.0.0' })
    await expect(c.getMe('t')).rejects.toBeInstanceOf(UpdateRequiredError)
    await expect(c.uploadReport('t', { report: {}, case: { player: '', notes: '' } })).rejects.toBeInstanceOf(UpdateRequiredError)
    expect(await c.pollDeviceToken('d')).toEqual({ kind: 'update_required', minVersion: '4.0.0' })
  })

  it('reads capabilities and the minimum version', async () => {
    const c = new AuthClient(BASE, mockFetch(() => json({ user, capabilities: ['upload_reports'], minVersion: null })))
    expect(await c.getMe('t')).toEqual({ capabilities: ['upload_reports'], minVersion: null })
  })

  it('accepts an upload only when the site returns one of its own check URLs', async () => {
    const ok = new AuthClient(BASE, mockFetch(() => json({ id: 'r1', url: `${BASE}/admin/reports/r1`, hashVerified: true })))
    expect(await ok.uploadReport('t', { report: {}, case: { player: 'p', notes: '' } })).toMatchObject({ id: 'r1', hashVerified: true })
    const evil = new AuthClient(BASE, mockFetch(() => json({ id: 'r1', url: 'https://evil.example/admin/reports/r1', hashVerified: true })))
    await expect(evil.uploadReport('t', { report: {}, case: { player: 'p', notes: '' } })).rejects.toThrow('bad_response')
    const denied = new AuthClient(BASE, mockFetch(() => json({ error: 'forbidden' }, 403)))
    await expect(denied.uploadReport('t', { report: {}, case: { player: 'p', notes: '' } })).rejects.toThrow('forbidden')
  })

  it('lists a player\'s site checks and encodes the key', async () => {
    let url = ''
    const check = { id: 'r1', scannedAt: '2026-01-01T00:00:00.000Z', band: 'high', score: 70, leads: 2, gameId: null, player: 'Bob', uploader: 'mod', hashVerified: true }
    const c = new AuthClient(BASE, mockFetch((u) => { url = u; return json({ key: 'name:bob', checks: [check] }) }))
    expect(await c.getPlayerChecks('t', 'name:bob smith')).toEqual([check])
    expect(url).toBe(`${BASE}/api/desktop/players/name%3Abob%20smith`)
  })
})
