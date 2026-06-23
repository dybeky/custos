// src/main/auth/auth-client.ts
import { z } from 'zod'
import type { PublicUser, AuthProvider } from '../../shared/types'

const PublicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  uid: z.number(),
  avatarVersion: z.number(),
  role: z.string().nullable(),
  status: z.enum(['active', 'banned', 'deleted']),
  image: z.string().nullable().optional()
})
const ExchangeSchema = z.object({ token: z.string(), user: PublicUserSchema })
const SessionSchema = z.object({ user: PublicUserSchema })
const DeviceCodeSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.string(),
  expires_in: z.number(),
  interval: z.number()
})

export type DevicePollResult =
  | { kind: 'pending' }
  | { kind: 'slow_down' }
  | { kind: 'token'; token: string; user: PublicUser }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'error'; code?: string }

export class AuthClient {
  constructor(private baseUrl: string, private fetchImpl: typeof fetch = fetch) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  buildStartUrl(state: string, codeChallenge: string, provider: Exclude<AuthProvider, 'device'>): string {
    const u = new URL(this.url('/desktop/auth/start'))
    u.searchParams.set('state', state)
    u.searchParams.set('cc', codeChallenge)
    u.searchParams.set('provider', provider)
    return u.toString()
  }

  buildDeviceVerificationUrl(): string {
    return this.url('/device')
  }

  /**
   * Stable profile URL. Uses the web's id-based entry route `/profile/id/<id>`,
   * which resolves the user server-side and redirects to their canonical
   * `/profile/<username>.<uid>` handle — so the link never breaks when the
   * username changes (§6.4).
   */
  buildProfileUrl(user: PublicUser): string {
    return this.url(`/profile/id/${encodeURIComponent(user.id)}`)
  }

  /** Public, token-free avatar URL (allowed by renderer img-src https: CSP). */
  avatarUrl(user: PublicUser): string {
    return this.url(`/api/avatar/${encodeURIComponent(user.id)}?v=${user.avatarVersion}`)
  }

  /**
   * Normalize the renderer-facing user: replace the web's raw provider `image`
   * with the canonical, versioned, token-free avatar endpoint. Main knows
   * `baseUrl`; the renderer never does, so the renderer can render `user.image`
   * directly (falling back to initials on load error). This also honors
   * `avatarVersion` and uploaded avatars, which the raw provider image does not.
   * (spec §6.5)
   */
  private withAvatar(user: PublicUser): PublicUser {
    return { ...user, image: this.avatarUrl(user) }
  }

  async exchange(args: { state: string; code: string; codeVerifier: string }): Promise<{ token: string; user: PublicUser }> {
    const res = await this.fetchImpl(this.url('/api/desktop/token/exchange'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: args.state, code: args.code, code_verifier: args.codeVerifier })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`exchange failed: ${body?.error ?? res.status}`)
    const parsed = ExchangeSchema.parse(body)
    return { token: parsed.token, user: this.withAvatar(parsed.user) }
  }

  async getSession(token: string): Promise<{ user: PublicUser } | null> {
    const res = await this.fetchImpl(this.url('/api/auth/get-session'), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 401) return null
    const body = await res.json().catch(() => ({}))
    const parsed = SessionSchema.safeParse(body)
    if (!parsed.success) return null
    if (parsed.data.user.status !== 'active') return null
    return { user: this.withAvatar(parsed.data.user) }
  }

  async requestDeviceCode(): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }> {
    const res = await this.fetchImpl(this.url('/api/desktop/device/code'), { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`device code failed: ${body?.error ?? res.status}`)
    const d = DeviceCodeSchema.parse(body)
    return {
      deviceCode: d.device_code,
      userCode: d.user_code,
      verificationUri: d.verification_uri,
      expiresIn: d.expires_in,
      interval: d.interval
    }
  }

  async pollDeviceToken(deviceCode: string): Promise<DevicePollResult> {
    const res = await this.fetchImpl(this.url('/api/desktop/device/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode })
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body?.token) {
      const ok = ExchangeSchema.safeParse(body)
      if (ok.success) return { kind: 'token', token: ok.data.token, user: this.withAvatar(ok.data.user) }
      return { kind: 'error', code: 'bad_token_response' }
    }
    switch (body?.error) {
      case 'authorization_pending': return { kind: 'pending' }
      case 'slow_down': return { kind: 'slow_down' }
      case 'expired_token': return { kind: 'expired' }
      case 'access_denied': return { kind: 'denied' }
      default: return { kind: 'error', code: body?.error }
    }
  }

  async revoke(token: string): Promise<void> {
    try {
      await this.fetchImpl(this.url('/api/auth/sign-out'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch {
      // best-effort; never throws (logout already wiped local token)
    }
  }

  /** Strip bearer/grant-looking tokens from a string before logging. */
  redact(s: string): string {
    return s
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/(code|code_verifier|token)=[A-Za-z0-9._-]+/gi, '$1=[redacted]')
  }
}
