import { describe, it, expect, vi, afterEach } from 'vitest'
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

describe('AuthService.openProfile', () => {
  it('opens the allowlisted /profile/id/<id> URL for the current user', async () => {
    const { svc, opened } = build()
    await svc.login('github')
    ;(svc as any).client.exchange = vi.fn(async () => ({ token: 'b', user }))
    await svc.handleCallback(`custos://auth/callback?state=${(svc as any).pendingAuth?.state ?? ''}&code=g`)
    opened.length = 0
    svc.openProfile()
    expect(opened.at(-1)).toBe(`${config.webBaseUrl}/profile/id/u1`)
  })
  it('is a no-op when there is no signed-in user', () => {
    const { svc, opened } = build()
    svc.openProfile()
    expect(opened).toHaveLength(0)
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

// A device-code response with a 1s poll interval. The interval drives the
// pollDevice sleep(); we use fake timers to advance through it deterministically.
const deviceCode = {
  deviceCode: 'dev-123', userCode: 'WXYZ-1234',
  verificationUri: 'http://localhost:3000/device', expiresIn: 600, interval: 1
}

describe('AuthService.login (device-code flow)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('happy path: requesting → awaiting-approval (code surfaced) → polled token → authed', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn(async () => ({ kind: 'token' as const, token: 'tok', user }))
    const { svc, tokens, opened, states } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    // synchronous prelude: device flow announces 'requesting' before awaiting the code
    expect(states[0]?.device?.status).toBe('requesting')
    expect(states[0]?.status).toBe('pending')

    // resolve requestDeviceCode + run the poll loop's first interval to completion
    await vi.advanceTimersByTimeAsync(1000)
    await done

    // userCode/verificationUri surfaced on the awaiting-approval emit, browser opened on /device
    const awaiting = states.find((s) => s.device?.status === 'awaiting-approval')
    expect(awaiting?.device?.userCode).toBe('WXYZ-1234')
    expect(awaiting?.device?.verificationUri).toBe('http://localhost:3000/device')
    expect(opened.at(-1)).toContain('/device')

    expect(pollDeviceToken).toHaveBeenCalledWith('dev-123')
    expect(svc.getState().status).toBe('authed')
    expect(svc.getState().user?.username).toBe('neo')
    expect(tokens.load()).toBe('tok')
  })

  it('slow_down: backs off (no busy-spin) then completes authed', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    // first poll → slow_down (interval grows by 5s), second poll → token
    const pollDeviceToken = vi.fn()
      .mockResolvedValueOnce({ kind: 'slow_down' as const })
      .mockResolvedValueOnce({ kind: 'token' as const, token: 'tok', user })
    const { svc } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    // first interval (1s) → slow_down. The loop must NOT poll again until the
    // backed-off interval (1s + 5s = 6s) elapses.
    await vi.advanceTimersByTimeAsync(1000)
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000) // not yet — only 5s since the slow_down
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000) // now 6s → second poll fires
    expect(pollDeviceToken).toHaveBeenCalledTimes(2)
    await done

    expect(svc.getState().status).toBe('authed')
  })

  it('denied: device status denied, settles to anon (not authed)', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn(async () => ({ kind: 'denied' as const }))
    const { svc } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    await vi.advanceTimersByTimeAsync(1000)
    await done

    expect(svc.getState().device?.status).toBe('denied')
    expect(svc.getState().status).toBe('anon')
    expect(svc.getState().user).toBeNull()
  })

  it('expired: device status expired, settles to anon (not authed)', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn(async () => ({ kind: 'expired' as const }))
    const { svc } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    await vi.advanceTimersByTimeAsync(1000)
    await done

    expect(svc.getState().device?.status).toBe('expired')
    expect(svc.getState().status).toBe('anon')
    expect(svc.getState().user).toBeNull()
  })

  it('max-duration: a never-resolving (always pending) poll loop terminates as expired', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn(async () => ({ kind: 'pending' as const }))
    const { svc } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    // Drive well past DEVICE_MAX_DURATION_MS (5 min). The bounded while-loop
    // must exit on the deadline rather than spin forever.
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 2000)
    await done

    expect(svc.getState().device?.status).toBe('expired')
    expect(svc.getState().status).toBe('anon')
    // polling emitted while pending, but it never settled to a token
    expect(pollDeviceToken).toHaveBeenCalled()
    expect(svc.getState().user).toBeNull()
  })

  it('cancel mid-poll: stops the loop and a late token is discarded (no silent re-login)', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    // poll #1 → pending (we reach the polling state), poll #2 (if it ever fires)
    // → token. After cancel(), the loop must NOT poll again and the token must
    // never be applied.
    const pollDeviceToken = vi.fn()
      .mockResolvedValueOnce({ kind: 'pending' as const })
      .mockResolvedValue({ kind: 'token' as const, token: 'tok', user })
    const { svc, tokens } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    // first interval (1s) → pending: we are now in the polling state
    await vi.advanceTimersByTimeAsync(1000)
    expect(svc.getState().device?.status).toBe('polling')
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)

    // user cancels (e.g. closed the login modal) — must tear down the poll
    await svc.cancel()
    expect(svc.getState().status).toBe('anon')

    // advance well past several intervals: a stale token result must be discarded
    await vi.advanceTimersByTimeAsync(10_000)
    await done

    // the loop stopped after cancel: at most the in-flight poll completed, no
    // further polling, and crucially NOT signed back in
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    expect(svc.getState().status).toBe('anon')
    expect(svc.getState().user).toBeNull()
    expect(tokens.load()).toBeNull()
  })

  it('logout mid-poll: a subsequent token result does not sign the user back in', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn()
      .mockResolvedValueOnce({ kind: 'pending' as const })
      .mockResolvedValue({ kind: 'token' as const, token: 'tok', user })
    const { svc, tokens } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    await vi.advanceTimersByTimeAsync(1000)
    expect(svc.getState().device?.status).toBe('polling')
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)

    await svc.logout()
    expect(svc.getState().status).toBe('anon')

    await vi.advanceTimersByTimeAsync(10_000)
    await done

    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    expect(svc.getState().status).toBe('anon')
    expect(svc.getState().user).toBeNull()
    expect(tokens.load()).toBeNull()
  })

  it('new login invalidates a prior device poll: starting login(google) stops the device loop', async () => {
    vi.useFakeTimers()
    const requestDeviceCode = vi.fn(async () => deviceCode)
    const pollDeviceToken = vi.fn()
      .mockResolvedValueOnce({ kind: 'pending' as const })
      .mockResolvedValue({ kind: 'token' as const, token: 'tok', user })
    const { svc, tokens } = build({ requestDeviceCode, pollDeviceToken } as any)

    const done = svc.login('device')
    await vi.advanceTimersByTimeAsync(1000)
    expect(svc.getState().device?.status).toBe('polling')
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)

    // a fresh browser login must invalidate the stale device poll
    await svc.login('google')
    expect(svc.getState().status).toBe('pending')

    await vi.advanceTimersByTimeAsync(10_000)
    await done

    // device loop stopped: no further polling, and the stale token never applied
    expect(pollDeviceToken).toHaveBeenCalledTimes(1)
    expect(svc.getState().user).toBeNull()
    expect(tokens.load()).toBeNull()
  })
})

describe('AuthService primary-login timeout → device-code offer', () => {
  afterEach(() => { vi.useRealTimers() })

  it('after ~90s the pending is cleared and the device-code affordance surfaces', async () => {
    vi.useFakeTimers()
    const { svc, states } = build()

    await svc.login('google')
    expect(svc.getState().status).toBe('pending')
    expect((svc as any).pendingAuth).not.toBeNull()
    const pendingTimer = (svc as any).pendingAuth.timer
    expect(pendingTimer).not.toBeNull()

    // advance past PENDING_TIMEOUT_MS (90s) → onPendingTimeout fires
    await vi.advanceTimersByTimeAsync(90_000)

    // pending (and its timer) cleared; device affordance offered; settled to anon
    expect((svc as any).pendingAuth).toBeNull()
    expect(svc.getState().device?.status).toBe('awaiting-approval')
    expect(svc.getState().status).toBe('anon')
    expect(states.at(-1)?.device?.status).toBe('awaiting-approval')
  })
})
