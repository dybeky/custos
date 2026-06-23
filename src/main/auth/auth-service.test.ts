import { describe, it, expect, vi } from 'vitest'
import { AuthService } from './auth-service'
import { AuthClient } from './auth-client'
import { TokenStore } from './token-store'
import type { PublicUser, AuthState } from '../../shared/types'

const user: PublicUser = { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' }
const config = { enabled: true, webBaseUrl: 'http://localhost:3000' }

function fakeStoreBackend() {
  let rec: any = {}
  return { get: () => rec, set: (_k: string, v: any) => { rec = v }, delete: () => { rec = {} } }
}
const safeOk = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s),
  decryptString: (b: Buffer) => b.toString()
}

function build(clientOverrides: Partial<AuthClient> = {}) {
  const tokens = new TokenStore({ safeStorage: safeOk, store: fakeStoreBackend() as any })
  const client = Object.assign(new AuthClient(config.webBaseUrl), clientOverrides)
  const opened: string[] = []
  const states: AuthState[] = []
  const svc = new AuthService({
    client, tokens, config,
    openExternal: (u) => opened.push(u),
    onChange: (s) => states.push(s)
  })
  return { svc, tokens, opened, states }
}

describe('AuthService.login (browser primary)', () => {
  it('opens the start URL and enters pending', async () => {
    const { svc, opened } = build()
    await svc.login('google')
    expect(opened[0]).toContain('/desktop/auth/start')
    expect(svc.getState().status).toBe('pending')
  })
})

describe('AuthService.handleCallback', () => {
  it('rejects a callback whose state does not match pending', async () => {
    const { svc } = build({ exchange: vi.fn() } as any)
    await svc.login('github')
    await svc.handleCallback('custos://auth/callback?state=WRONG&code=g')
    expect(svc.getState().status).toBe('anon') // pending cleared on rejected callback
  })
  it('exchanges a matching callback and becomes authed', async () => {
    const { svc, states } = build()
    // capture the real state we generated
    await svc.login('github')
    const pendingState = (svc as any).pendingAuth.state
    ;(svc as any).client.exchange = vi.fn(async () => ({ token: 'b', user }))
    await svc.handleCallback(`custos://auth/callback?state=${pendingState}&code=g`)
    expect(svc.getState().status).toBe('authed')
    expect(svc.getState().user?.username).toBe('neo')
    expect(states.at(-1)?.status).toBe('authed')
  })
})

describe('AuthService.logout', () => {
  it('wipes local token before (and regardless of) revoke', async () => {
    const { svc, tokens } = build()
    await svc.login('github')
    ;(svc as any).client.exchange = vi.fn(async () => ({ token: 'b', user }))
    await svc.handleCallback(`custos://auth/callback?state=${(svc as any).pendingAuth?.state ?? ''}&code=g`)
    const revoke = vi.fn(async () => { throw new Error('network down') })
    ;(svc as any).client.revoke = revoke
    await svc.logout()
    expect(tokens.load()).toBeNull()
    expect(svc.getState().status).toBe('anon')
  })
})

describe('AuthService.validateOnStartup', () => {
  it('wipes to anonymous when get-session returns null (banned/deleted/401)', async () => {
    const { svc, tokens } = build()
    tokens.save('b'); tokens.saveUser(user)
    ;(svc as any).client.getSession = vi.fn(async () => null)
    await svc.validateOnStartup()
    expect(tokens.load()).toBeNull()
    expect(svc.getState().status).toBe('anon')
  })
  it('stays authed and refreshes the user on a valid session', async () => {
    const { svc, tokens } = build()
    tokens.save('b'); tokens.saveUser(user)
    ;(svc as any).client.getSession = vi.fn(async () => ({ user: { ...user, username: 'renamed' } }))
    await svc.validateOnStartup()
    expect(svc.getState().status).toBe('authed')
    expect(svc.getState().user?.username).toBe('renamed')
  })
})

describe('AuthService kill switch', () => {
  it('login is a no-op and state stays anon when disabled', async () => {
    const tokens = new TokenStore({ safeStorage: safeOk, store: fakeStoreBackend() as any })
    const svc = new AuthService({
      client: new AuthClient(config.webBaseUrl), tokens,
      config: { ...config, enabled: false },
      openExternal: () => { throw new Error('should not open') },
      onChange: () => {}
    })
    await svc.login('google')
    expect(svc.getState().status).toBe('anon')
  })
})
