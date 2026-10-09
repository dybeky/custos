// src/main/auth/auth-service.ts
import { generateState, generatePkce } from './pkce'
import { parseCallback } from './callback-parser'
import { UpdateRequiredError, type AuthClient, type DevicePollResult, type UploadCase } from './auth-client'
import type { TokenStore } from './token-store'
import type { AuthConfig } from '../services/config-service'
import type { AuthState, AuthProvider, PublicUser, DeviceProgress, SiteUploadResult, SitePlayerResult, ScanReport } from '../../shared/types'

const PENDING_TIMEOUT_MS = 90_000
const DEVICE_MAX_DURATION_MS = 5 * 60_000

interface PendingAuth {
  state: string
  codeVerifier: string
  provider: AuthProvider
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}

export interface AuthServiceDeps {
  client: AuthClient
  tokens: TokenStore
  config: AuthConfig
  openExternal: (url: string) => void
  onChange: (state: AuthState) => void
}

/** A transport failure reads as 'network' (retried, explained in the UI); site error codes pass through. */
function networkError(message: string | undefined): string {
  if (!message) return 'failed'
  return /fetch failed|network|ENOTFOUND|ECONN|timeout|aborted/i.test(message) ? 'network' : message
}

export class AuthService {
  private status: AuthState['status'] = 'anon'
  private user: PublicUser | null = null
  private device: DeviceProgress | undefined = undefined
  private encryptionUnavailable = false
  /** Site capabilities (display hint; the site re-checks every call). Never persisted. */
  private capabilities: string[] = []
  /** Minimum app version the site demands, once it refused this build. */
  private updateRequired: string | undefined = undefined
  private pendingAuth: PendingAuth | null = null
  // Monotonic device-flow generation. The device poll loop closes over the
  // epoch captured at flow start; bumping it (cancel/logout/login or a new
  // device flow) invalidates any in-flight loop so it stops and discards a
  // late token instead of silently re-logging the user in (§4.4, §4.9).
  private deviceEpoch = 0

  // Same object references as deps.client / deps.tokens. All call sites read
  // through these fields so swapping a method on the live client (tests/seams)
  // is observed. They are plain references — never a token or code-verifier.
  private readonly client: AuthClient
  private readonly tokens: TokenStore

  constructor(private deps: AuthServiceDeps) {
    this.client = deps.client
    this.tokens = deps.tokens
  }

  getState(): AuthState {
    return {
      status: this.status,
      user: this.user,
      device: this.device,
      encryptionUnavailable: this.encryptionUnavailable || undefined,
      capabilities: this.status === 'authed' && this.capabilities.length ? [...this.capabilities] : undefined,
      updateRequired: this.updateRequired
    }
  }

  /** Record the site's "update required" answer; the UI then offers the update. */
  private markUpdateRequired(minVersion: string): void {
    this.updateRequired = minVersion || '?'
    this.capabilities = []
  }

  /**
   * Refresh what the signed-in user may do from the app. Transient failures keep
   * the last known set; an outdated app loses every site feature.
   */
  private async refreshCapabilities(token: string): Promise<void> {
    try {
      const me = await this.client.getMe(token)
      this.capabilities = me.capabilities
      this.updateRequired = undefined
    } catch (e) {
      if (e instanceof UpdateRequiredError) this.markUpdateRequired(e.minVersion)
      else return
    }
    this.emit()
  }

  private emit(): void {
    this.deps.onChange(this.getState())
  }

  private clearPending(): void {
    if (this.pendingAuth?.timer) clearTimeout(this.pendingAuth.timer)
    this.pendingAuth = null
  }

  /** Drop to authed-if-user-else-anon (used after a failed/cancelled pending). */
  private settleToBaseline(): void {
    this.device = undefined
    this.status = this.user ? 'authed' : 'anon'
  }

  async login(provider: AuthProvider): Promise<void> {
    if (!this.deps.config.enabled) return // kill switch (§4.13)
    this.clearPending()
    this.deviceEpoch++ // invalidate any stale device poll from a prior attempt
    if (provider === 'device') {
      await this.runDeviceFlow()
      return
    }
    const state = generateState()
    const { codeVerifier, codeChallenge } = generatePkce()
    const timer = setTimeout(() => this.onPendingTimeout(), PENDING_TIMEOUT_MS)
    this.pendingAuth = { state, codeVerifier, provider, startedAt: Date.now(), timer }
    this.status = 'pending'
    this.device = undefined
    this.emit()
    this.deps.openExternal(this.client.buildStartUrl(state, codeChallenge, provider))
  }

  private onPendingTimeout(): void {
    // Timeout (~90s): offer device code (§4.4). Clear primary pending.
    this.clearPending()
    this.device = { status: 'awaiting-approval' } // UI shows "use a code"
    this.status = this.user ? 'authed' : 'anon'
    this.emit()
  }

  async handleCallback(url: string): Promise<void> {
    const parsed = parseCallback(url)
    if (!parsed || !this.pendingAuth || parsed.state !== this.pendingAuth.state) {
      // Rejected callback (§4.6) → clear pending (§4.9), non-sensitive log.
      this.clearPending()
      this.settleToBaseline()
      this.emit()
      return
    }
    const { codeVerifier, state } = this.pendingAuth
    try {
      const { token, user } = await this.client.exchange({ state, code: parsed.code, codeVerifier })
      this.completeAuth(token, user)
    } catch (e) {
      if (e instanceof UpdateRequiredError) this.markUpdateRequired(e.minVersion)
      this.clearPending()
      this.settleToBaseline()
      this.emit()
    }
  }

  private completeAuth(token: string, user: PublicUser): void {
    this.clearPending()
    const persisted = this.tokens.save(token)
    this.encryptionUnavailable = !persisted
    this.tokens.saveUser(user)
    this.user = user
    this.status = 'authed'
    this.device = undefined
    this.emit()
    void this.refreshCapabilities(token)
  }

  async cancel(): Promise<void> {
    this.clearPending()
    this.deviceEpoch++ // tear down any running device/poll flow (UserMenu contract)
    this.settleToBaseline()
    this.emit()
  }

  async logout(): Promise<void> {
    const token = this.tokens.load()
    // Local wipe FIRST (guaranteed, never blocked) — §4.10
    this.tokens.clear()
    this.clearPending()
    this.deviceEpoch++ // stop any running device poll; discard a late token
    this.user = null
    this.status = 'anon'
    this.device = undefined
    this.encryptionUnavailable = false
    this.capabilities = []
    this.emit()
    // Best-effort server revoke (non-blocking, never throws)
    if (token) void this.client.revoke(token)
  }

  /**
   * Open the signed-in user's profile on the web in the system browser.
   * The renderer never builds a 97437.dev URL — it calls this via IPC, and main
   * constructs the canonical id-based profile link (buildProfileUrl → /profile/
   * id/<id>). openExternal is allowlisted by isAllowedAuthUrl, which permits the
   * /profile/id/ path. Per §6.4 startup validation has already refreshed the
   * cached user, so the link points at the current account. No-op when anon.
   */
  openProfile(): void {
    if (!this.user) return
    this.deps.openExternal(this.client.buildProfileUrl(this.user))
  }

  /**
   * Change the signed-in user's avatar. The renderer sends the cropped image bytes
   * (it never holds the bearer); main uploads them, then re-fetches the session so
   * `avatarVersion` bumps and the new avatar URL is emitted to every surface.
   */
  async uploadAvatar(bytes: ArrayBuffer, mime: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.deps.config.enabled) return { ok: false, error: 'disabled' }
    const token = this.tokens.load()
    if (!token || this.status !== 'authed') return { ok: false, error: 'not_signed_in' }
    try {
      await this.client.uploadAvatar(token, bytes, mime)
    } catch (e) {
      return { ok: false, error: (e as Error).message || 'upload_failed' }
    }
    // Refresh so avatarVersion bumps and the version-keyed Avatar refetches.
    // The upload already succeeded, so a failed refresh must not turn it into
    // an error; the new avatar simply shows up on the next session check.
    try {
      const session = await this.client.getSession(token)
      if (session) {
        this.user = session.user
        this.tokens.saveUser(session.user)
        this.emit()
      }
    } catch {
      // transient — keep the current user
    }
    return { ok: true }
  }

  async validateOnStartup(): Promise<void> {
    if (!this.deps.config.enabled) return
    const token = this.tokens.load()
    if (!token) { this.status = 'anon'; this.user = null; return }
    // Cached user is display-only; show it briefly to avoid a logged-out flash.
    this.user = this.tokens.loadUser()
    this.status = this.user ? 'authed' : 'anon'
    this.emit()
    let session: { user: PublicUser } | null
    try {
      session = await this.client.getSession(token)
    } catch {
      // Offline / timeout / 5xx: the token may well still be valid. Keep the
      // cached login rather than signing the user out over a transient failure;
      // the next launch re-validates.
      return
    }
    if (!session) {
      // banned/deleted/401 → silent wipe → anonymous (§4.5)
      this.tokens.clear()
      this.user = null
      this.status = 'anon'
      this.emit()
      return
    }
    this.user = session.user
    this.tokens.saveUser(session.user)
    this.status = 'authed'
    this.emit()
    await this.refreshCapabilities(token)
  }

  /** Run a site call with the bearer; maps "not signed in" and "update required". */
  private async withToken<T>(fn: (token: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    if (!this.deps.config.enabled) return { ok: false, error: 'disabled' }
    const token = this.tokens.load()
    if (!token || this.status !== 'authed') return { ok: false, error: 'not_signed_in' }
    try {
      return { ok: true, value: await fn(token) }
    } catch (e) {
      if (e instanceof UpdateRequiredError) {
        this.markUpdateRequired(e.minVersion)
        this.emit()
        return { ok: false, error: 'update_required' }
      }
      return { ok: false, error: networkError((e as Error).message) }
    }
  }

  /**
   * Send a check to the site. Staff signed in with upload rights upload under
   * their account; everyone else — no sign-in needed — sends it with the
   * check's sync secret, so what matters (who was checked) always reaches the site.
   *
   * `via` is how this check reached the site before: re-sends stay on that
   * path, so one check never ends up as two rows (one per path).
   */
  async uploadCheck(report: ScanReport, kase: UploadCase, syncKey: string, via?: 'account' | 'public'): Promise<SiteUploadResult> {
    if (!this.deps.config.enabled) return { ok: false, error: 'disabled' }
    const canUseAccount = this.status === 'authed' && this.capabilities.includes('upload_reports')
    if (via === 'account' && !canUseAccount) return { ok: false, error: 'not_signed_in' }
    if (via !== 'public' && canUseAccount) {
      const res = await this.withToken((t) => this.client.uploadReport(t, { report, case: kase }))
      if (res.ok) return { ok: true, url: res.value.url, hashVerified: res.value.hashVerified, via: 'account' }
      // A first send whose session lapsed still gets through without it.
      if (via || (res.error !== 'not_signed_in' && res.error !== 'unauthorized')) return { ok: false, error: res.error }
    }
    try {
      const value = await this.client.uploadReportPublic({ report, case: kase, syncKey })
      return { ok: true, url: this.siteCheckUrl(value.id), hashVerified: value.hashVerified, via: 'public' }
    } catch (e) {
      if (e instanceof UpdateRequiredError) {
        this.markUpdateRequired(e.minVersion)
        this.emit()
        return { ok: false, error: 'update_required' }
      }
      return { ok: false, error: networkError((e as Error).message) }
    }
  }

  /** Checks of one player (by player key) uploaded by any checker. */
  async playerChecks(key: string): Promise<SitePlayerResult> {
    const res = await this.withToken((t) => this.client.getPlayerChecks(t, key))
    return res.ok ? { ok: true, checks: res.value } : { ok: false, error: res.error }
  }

  siteCheckUrl(id: string): string {
    return new URL(`/admin/reports/${encodeURIComponent(id)}`, this.deps.config.webBaseUrl).toString()
  }

  sitePlayerUrl(key: string): string {
    return this.client.buildPlayerUrl(key)
  }

  /** Open a site page (allowlisted by openExternal). No-op when signed out. */
  openSite(url: string): void {
    if (this.status !== 'authed') return
    this.deps.openExternal(url)
  }

  private async runDeviceFlow(): Promise<void> {
    // Start a new device generation (and invalidate any prior one). The poll
    // loop checks this captured epoch against the live counter; cancel/logout/
    // login bump the counter to stop a stale loop and discard a late token.
    const myEpoch = ++this.deviceEpoch
    this.device = { status: 'requesting' }
    this.status = 'pending'
    this.emit()
    let code
    try {
      code = await this.client.requestDeviceCode()
    } catch {
      if (myEpoch !== this.deviceEpoch) return // cancelled during the request
      this.device = { status: 'error' }
      this.status = this.user ? 'authed' : 'anon'
      this.emit()
      return
    }
    if (myEpoch !== this.deviceEpoch) return // cancelled while awaiting the code
    this.device = { status: 'awaiting-approval', userCode: code.userCode, verificationUri: code.verificationUri }
    this.emit()
    this.deps.openExternal(this.client.buildDeviceVerificationUrl())
    await this.pollDevice(code.deviceCode, code.interval, Date.now(), myEpoch)
  }

  private async pollDevice(deviceCode: string, intervalSec: number, startedAt: number, myEpoch: number): Promise<void> {
    let intervalMs = Math.max(1, intervalSec) * 1000
    // Bounded loop (§4.4): honor interval, back off on slow_down, cap duration.
    while (Date.now() - startedAt < DEVICE_MAX_DURATION_MS) {
      // Stop before sleeping if this flow was cancelled (§4.9).
      if (myEpoch !== this.deviceEpoch) return
      await new Promise((r) => setTimeout(r, intervalMs))
      // cancel/logout/login may have landed during the sleep — don't even poll.
      if (myEpoch !== this.deviceEpoch) return
      let res: DevicePollResult
      try {
        res = await this.client.pollDeviceToken(deviceCode)
      } catch {
        // Network error / timeout on a single poll is transient: keep polling
        // until the flow's deadline instead of stranding the UI in 'polling'.
        continue
      }
      // Re-check AFTER the poll await too: cancellation may have landed while
      // the poll was in flight. A stale result (incl. a token) is discarded —
      // no emit, no completeAuth, no silent re-login.
      if (myEpoch !== this.deviceEpoch) return
      if (res.kind === 'token') { this.completeAuth(res.token, res.user); return }
      if (res.kind === 'slow_down') { intervalMs += 5000; continue }
      if (res.kind === 'pending') { this.device = { status: 'polling', userCode: this.device?.userCode, verificationUri: this.device?.verificationUri }; this.emit(); continue }
      if (res.kind === 'denied') { this.device = { status: 'denied' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return }
      if (res.kind === 'update_required') { this.markUpdateRequired(res.minVersion); this.device = { status: 'error' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return }
      if (res.kind === 'expired') { this.device = { status: 'expired' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return }
      this.device = { status: 'error' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return
    }
    if (myEpoch !== this.deviceEpoch) return // cancelled at the deadline boundary
    this.device = { status: 'expired' } // max duration hit → treat as expired
    this.status = this.user ? 'authed' : 'anon'
    this.emit()
  }
}
