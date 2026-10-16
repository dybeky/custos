import { describe, it, expect, vi } from 'vitest'
import { AuthService } from './auth-service'
import { AuthClient } from './auth-client'
import { TokenStore } from './token-store'
import type { PublicUser, AuthState } from '../../shared/types'

const user: PublicUser = { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' }
const config = { enabled: true, webBaseUrl: 'http://localhost:3000' }

function build(overrides: Partial<AuthClient>) {
  let rec: any = {}
  const store = { get: () => rec, set: (_k: string, v: any) => { rec = v }, delete: () => { rec = {} } }
  const tokens = new TokenStore({
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
    store: store as any
  })
  const states: AuthState[] = []
  const svc = new AuthService({
    client: Object.assign(new AuthClient(config.webBaseUrl), overrides),
    tokens, config, openExternal: () => {}, onChange: (s) => states.push(s)
  })
  return { svc, states }
}

async function signIn(svc: AuthService): Promise<void> {
  await svc.login('github')
  await svc.handleCallback(`custos://auth/callback?state=${(svc as any).pendingAuth.state}&code=g`)
}

describe('AuthService after a sign-out', () => {
  it('ignores the capabilities of a session that was signed out meanwhile', async () => {
    let answer!: (v: { capabilities: string[]; minVersion: null }) => void
    const { svc, states } = build({
      exchange: vi.fn(async () => ({ token: 'b', user })),
      getMe: vi.fn(() => new Promise((r) => { answer = r as typeof answer })),
      revoke: vi.fn(async () => {})
    } as any)
    await signIn(svc)
    await svc.logout()
    const emitted = states.length
    answer({ capabilities: ['upload_reports'], minVersion: null })
    await new Promise((r) => setTimeout(r, 0))
    expect((svc as any).capabilities).toEqual([])
    expect(states.length).toBe(emitted)
  })

  it('does not bring the user back when an avatar upload finishes after sign-out', async () => {
    let finish!: (v: { user: PublicUser }) => void
    const { svc } = build({
      exchange: vi.fn(async () => ({ token: 'b', user })),
      getMe: vi.fn(async () => ({ capabilities: [], minVersion: null })),
      revoke: vi.fn(async () => {}),
      uploadAvatar: vi.fn(async () => {}),
      getSession: vi.fn(() => new Promise((r) => { finish = r as typeof finish }))
    } as any)
    await signIn(svc)
    const upload = svc.uploadAvatar(new ArrayBuffer(8), 'image/webp')
    await new Promise((r) => setTimeout(r, 0))
    await svc.logout()
    finish({ user })
    await upload
    expect(svc.getState().user).toBeNull()
    expect(svc.getState().status).toBe('anon')
  })
})
