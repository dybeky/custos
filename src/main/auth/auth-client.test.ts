// src/main/auth/auth-client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AuthClient } from './auth-client'
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
