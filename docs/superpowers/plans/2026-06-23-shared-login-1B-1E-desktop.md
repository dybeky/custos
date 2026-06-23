# Custos Shared-Login (Desktop, Phases 1B–1E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional shared `97437.dev` account login + identity display + visual alignment to the `custos` Electron scanner, with ALL auth networking in the main process and the renderer seeing only public, token-free state.

**Architecture:** The Electron **main process** owns a new `AuthService` that runs the entire auth flow (PKCE/state generation, system-browser OAuth, strict `custos://` callback parsing, signed-grant HTTPS exchange, device-code fallback, `safeStorage` token store, startup validation, logout/revoke). It is gated by a bundled kill switch read through the existing `config-service` pattern. A new zod-validated IPC surface (`auth:get-state`, `auth:login`, `auth:cancel`, `auth:logout`, push `auth:changed`) bridges only `{status, public user, device progress}` to the renderer. The renderer adds an `auth-store` (mirroring `settings-store`), a login modal with a device-code panel, a header user cluster, an avatar primitive, and a Settings "Account" card. Phase 1D retargets design tokens to the web's exact palette and fully removes the three dead `[data-theme]` themes (with a settings migration). Built and unit-tested against a **local custosweb dev backend** (HTTP mocked in unit tests); real network calls are reserved for the Phase 1E manual Windows checklist.

**Tech Stack:** Electron 42 (`app`, `safeStorage`, `shell`, `ipcMain`), Node `crypto` (PKCE S256), `electron-store@10`, zod@4, React 19 + zustand@5 + react-i18next, Tailwind 3, vitest@4 (node env).

## Global Constraints

These binding rules apply to **every** task below.

- **PR-1 — Login is optional.** Local scan, local results, local export, and basic settings must work with **no account and no internet**. Login never gates the scanner. (spec §1 PR-1, §6.3)
- **PR-2 — Kill switch.** A feature flag `DESKTOP_AUTH_ENABLED` (default may be on, flippable to `false`) disables desktop login end-to-end. With it off, the scanner runs fully anonymously and no auth UI is shown. (spec §1 PR-2, §4.13)
- **PR-3 — Phase 1 ≠ report sharing.** Phase 1 is login + identity + profile display + visual alignment only. No report upload/sharing. (spec §1 PR-3, §3, §14)
- **Renderer never sees token-like material.** The renderer (and anything reachable from it) NEVER receives the bearer token, the grant `code`, the `code_verifier`, or raw auth HTTP responses. The IPC surface returns ONLY `status` (`anon|pending|authed`), public user fields (`id, username, uid, avatarVersion, role, status, image?`), and device-code display/progress (`userCode`, `verificationUri`, status enum). All auth HTTP is in main. (spec §3, §4.8)
- **Fail closed on `safeStorage`.** Bearer stored only in main, encrypted via Electron `safeStorage`, persisted as base64 in electron-store under `auth`. If `safeStorage.isEncryptionAvailable()` is false/weak, do NOT write a plaintext credential to disk — keep auth memory-only for the run / require re-login after restart, and inform the user via copy. Never silently downgrade to plaintext. (spec §4.7, §8)
- **Strict `custos://` parsing.** The handler accepts ONLY `custos://auth/callback?state=…&code=…` with both params present and well-formed AND `state` matching the current `pendingAuth`. Any other host/path/scheme/shape/missing/garbage/mismatched-state is rejected, logged non-sensitively, never acted on, and clears `pendingAuth`. (spec §4.6, §4.9)
- **Pending-state always cleared** on every terminal outcome: success, timeout (~90s → offer device code), user cancel, failure, rejected callback. No orphaned timers or deep-link listeners. (spec §4.9)
- **Logout: local-wipe first.** Logout deletes the local `safeStorage` token immediately (guaranteed, never blocked); THEN best-effort server-revoke (`POST /api/auth/sign-out` with bearer) that does not block or reverse local logout. (spec §4.10)
- **`openExternal` allowlist.** The auth flow opens ONLY expected `https://97437.dev/...` auth/profile/device URLs; no arbitrary renderer-controlled URLs. `custos://` is inbound and never goes through `openExternal`. (spec §6.1, §6.5)
- **Token validation is source of truth.** Long-lived bearer, validated on startup via `GET /api/auth/get-session`; cached user is display-only; banned/deleted/401 ⇒ silent local wipe → anonymous, no error nag. No silent background refresh in v1. (spec §4.5)
- **Bounded device polling.** Honor server `interval`, back off on `slow_down`, enforce a max poll duration, stop on `denied`/`expired`/`error`. No infinite polling. (spec §4.4)
- **Non-sensitive logging.** Never log bearer tokens, grants, `code_verifier`, or full callback URLs (log a hash, `jti`, or `userId` only). (spec §4.12)
- **Keep-Inter divergence.** Keep Inter as the Cyrillic fallback (desktop has `ru` i18n). Font stack: `['MuseoModerno','Inter','system-ui','sans-serif']`. (spec §7.2 Divergence 1)
- **Keep-JetBrains-Mono divergence.** Keep a true monospace (JetBrains Mono) for forensic data (hashes, paths, registry keys, timestamps, tabular output). (spec §7.2 Divergence 2)
- **Full dead-theme removal + migration.** Remove the `aurora`/`mono`/`tropical` themes completely (drop duplicate `[data-theme]` CSS blocks, single `:root`), set `<html data-theme="dark">` statically, remove the theme selector from `settings-store` + Settings UI, repoint main `backgroundColor` to the new `--bg`, and add a migration so an existing persisted `settings.theme` value doesn't trip the `.strict()` zod schema. (spec §7.5)
- **Merge rule.** No direct merge to `main` after a huge diff. Open a PR per repo; run typecheck + lint + build + tests in both repos; then manually test the login flow (local → production-like) before deployment. Do NOT merge on unit-test green alone. (spec §10, §13)
- **Interface contract is fixed (Phase 1A).** Do not change the HTTP routes, the `PublicUser` shape, the avatar URL form, or the IPC/preload names defined in the contract. Consume them exactly.

**Shared TS types (defined once in Task 1B-7, used identically everywhere):**

```ts
export interface PublicUser {
  id: string
  username: string
  uid: number
  avatarVersion: number
  role: string | null
  status: 'active' | 'banned' | 'deleted'
  image?: string | null
}
export type AuthStatus = 'anon' | 'pending' | 'authed'
export type DeviceStatus =
  | 'requesting' | 'awaiting-approval' | 'polling' | 'denied' | 'expired' | 'error'
export interface DeviceProgress {
  status: DeviceStatus
  userCode?: string
  verificationUri?: string
}
export interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  device?: DeviceProgress
}
export type AuthProvider = 'google' | 'github' | 'device'
```

---

## Phase 1B (main)

### Task 1B-1: PKCE + state generation utility

**Files:**
- Create: `src/main/auth/pkce.ts`
- Test: `src/main/auth/pkce.test.ts`

**Interfaces:**
- Consumes: Node `crypto` (`randomBytes`, `createHash`).
- Produces:
  - `randomUrlSafe(byteLen: number): string` — base64url of `byteLen` random bytes, no padding.
  - `generateState(): string` — 32-byte url-safe random.
  - `generatePkce(): { codeVerifier: string; codeChallenge: string }` — verifier is 32-byte url-safe; `codeChallenge = base64url(sha256(codeVerifier))` (S256).
  - `sha256Base64Url(input: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/auth/pkce.test.ts
import { describe, it, expect } from 'vitest'
import { randomUrlSafe, generateState, generatePkce, sha256Base64Url } from './pkce'

const B64URL = /^[A-Za-z0-9_-]+$/

describe('pkce', () => {
  it('randomUrlSafe produces padding-free base64url', () => {
    const s = randomUrlSafe(32)
    expect(s).toMatch(B64URL)
    expect(s).not.toContain('=')
    expect(s.length).toBeGreaterThanOrEqual(43)
  })

  it('generateState is unique and url-safe', () => {
    expect(generateState()).toMatch(B64URL)
    expect(generateState()).not.toBe(generateState())
  })

  it('generatePkce derives an S256 challenge from the verifier', () => {
    const { codeVerifier, codeChallenge } = generatePkce()
    expect(codeVerifier).toMatch(B64URL)
    expect(codeChallenge).toMatch(B64URL)
    expect(codeChallenge).toBe(sha256Base64Url(codeVerifier))
  })

  it('sha256Base64Url matches a known vector', () => {
    // base64url(sha256("abc")) with padding stripped
    expect(sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/pkce.test.ts`
Expected: FAIL with "Failed to resolve import './pkce'" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/auth/pkce.ts
import { randomBytes, createHash } from 'crypto'

/** base64url (RFC 4648 §5) with padding removed. */
function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Random url-safe token of `byteLen` bytes of entropy. */
export function randomUrlSafe(byteLen: number): string {
  return toBase64Url(randomBytes(byteLen))
}

/** Opaque login-attempt state (binds the callback to this attempt). */
export function generateState(): string {
  return randomUrlSafe(32)
}

/** base64url(sha256(input)). */
export function sha256Base64Url(input: string): string {
  return toBase64Url(createHash('sha256').update(input).digest())
}

/** PKCE S256 pair: verifier (secret, stays in main) + derived challenge. */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomUrlSafe(32)
  return { codeVerifier, codeChallenge: sha256Base64Url(codeVerifier) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/pkce.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/auth/pkce.ts src/main/auth/pkce.test.ts
git commit -m "feat(auth): PKCE S256 + state generation util"
```

---

### Task 1B-2: Auth config (WEB_BASE_URL + DESKTOP_AUTH_ENABLED kill switch)

**Files:**
- Modify: `resources/settings.json` (add a top-level `auth` block)
- Modify: `src/main/services/config-service.ts` (add `AuthConfigSchema` + `loadAuthConfig()`)
- Test: `src/main/services/auth-config.test.ts`

**Interfaces:**
- Consumes: the `configService` singleton + `getResourcePath()` pattern already in `config-service.ts`.
- Produces:
  - `AuthConfig = { enabled: boolean; webBaseUrl: string }` (zod-inferred).
  - `configService.loadAuthConfig(): AuthConfig` — reads `resources/settings.json` `auth` block; defaults to `{ enabled: true, webBaseUrl: 'https://97437.dev' }` if the block is missing/invalid. An env override `WEB_BASE_URL` (e.g. `http://localhost:3000`) wins when set; an env override `DESKTOP_AUTH_ENABLED=false` forces `enabled:false`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/auth-config.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

import { AuthConfigSchema } from './config-service'
import { resolveAuthConfig } from './config-service'

describe('AuthConfigSchema', () => {
  it('accepts a valid block', () => {
    const r = AuthConfigSchema.safeParse({ enabled: true, webBaseUrl: 'https://97437.dev' })
    expect(r.success).toBe(true)
  })
  it('rejects a non-url base', () => {
    expect(AuthConfigSchema.safeParse({ enabled: true, webBaseUrl: 'not a url' }).success).toBe(false)
  })
})

describe('resolveAuthConfig (env overrides)', () => {
  beforeEach(() => {
    delete process.env.WEB_BASE_URL
    delete process.env.DESKTOP_AUTH_ENABLED
  })
  it('uses the file block when no env override', () => {
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }))
      .toEqual({ enabled: true, webBaseUrl: 'https://97437.dev' })
  })
  it('WEB_BASE_URL env overrides the base', () => {
    process.env.WEB_BASE_URL = 'http://localhost:3000'
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }).webBaseUrl)
      .toBe('http://localhost:3000')
  })
  it('DESKTOP_AUTH_ENABLED=false env forces disabled', () => {
    process.env.DESKTOP_AUTH_ENABLED = 'false'
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }).enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/auth-config.test.ts`
Expected: FAIL — `AuthConfigSchema` / `resolveAuthConfig` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/main/services/config-service.ts`, after the existing `KnownHashesSchema` export block, add:

```ts
// ── Desktop auth config (kill switch + web base URL) ──────────────────────────
const AuthConfigSchema = z.object({
  enabled: z.boolean(),
  webBaseUrl: z.string().url()
})
export { AuthConfigSchema }
export type AuthConfig = z.infer<typeof AuthConfigSchema>

const DEFAULT_AUTH_CONFIG: AuthConfig = { enabled: true, webBaseUrl: 'https://97437.dev' }

/** Apply WEB_BASE_URL / DESKTOP_AUTH_ENABLED env overrides on top of a file block. */
export function resolveAuthConfig(fileBlock: AuthConfig): AuthConfig {
  const webBaseUrl = process.env.WEB_BASE_URL || fileBlock.webBaseUrl
  const enabled = process.env.DESKTOP_AUTH_ENABLED === 'false' ? false : fileBlock.enabled
  return { enabled, webBaseUrl }
}
```

Add a method on the `ConfigService` class (next to `loadKnownHashes`):

```ts
  private authConfig: AuthConfig | null = null

  loadAuthConfig(): AuthConfig {
    if (this.authConfig) return this.authConfig
    let fileBlock = DEFAULT_AUTH_CONFIG
    try {
      const configPath = join(this.getResourcePath(), 'settings.json')
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
      const result = AuthConfigSchema.safeParse(parsed.auth)
      if (result.success) fileBlock = result.data
      else logger.warn('Auth config block missing/invalid; using defaults')
    } catch (error) {
      logger.warn('Failed to read auth config; using defaults', { error: String(error) })
    }
    this.authConfig = resolveAuthConfig(fileBlock)
    return this.authConfig
  }
```

Declare `authConfig` as a private field on the class (add `private authConfig: AuthConfig | null = null` near the other private fields). In `resources/settings.json`, add a top-level key:

```json
"auth": { "enabled": true, "webBaseUrl": "https://97437.dev" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/auth-config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/config-service.ts src/main/services/auth-config.test.ts resources/settings.json
git commit -m "feat(auth): bundled auth config + WEB_BASE_URL/kill-switch env overrides"
```

---

### Task 1B-3: safeStorage token store (fail-closed) in app-store

**Files:**
- Modify: `src/main/services/app-store.ts` (add `auth` key to schema)
- Create: `src/main/auth/token-store.ts`
- Test: `src/main/auth/token-store.test.ts`

**Interfaces:**
- Consumes: `appStore` (electron-store) from `app-store.ts`; Electron `safeStorage`.
- Produces a `TokenStore` class (testable via injected `safeStorage`-like + `store`-like deps so unit tests don't need real Electron):
  - `new TokenStore(deps: { safeStorage: SafeStorageLike; store: AuthStoreLike })`
  - `isEncryptionAvailable(): boolean`
  - `save(token: string): boolean` — encrypts + base64-persists under `auth.tokenEnc`; if encryption unavailable, keeps the token **memory-only** and returns `false` (caller surfaces the §9 copy). Never writes plaintext.
  - `load(): string | null` — returns the memory token if present, else decrypts `auth.tokenEnc`; returns `null` (and clears) if decryption fails.
  - `clear(): void` — wipes memory token + `auth.tokenEnc` + `auth.user`.
  - `saveUser(user: CachedUser): void` / `loadUser(): CachedUser | null` where `CachedUser = PublicUser`.
  - Types: `SafeStorageLike = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string }`, `AuthStoreLike = { get(k: 'auth'): AuthRecord | undefined; set(k: 'auth', v: AuthRecord): void; delete(k: 'auth'): void }`, `AuthRecord = { tokenEnc?: string; user?: CachedUser }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/auth/token-store.test.ts
import { describe, it, expect, vi } from 'vitest'
import { TokenStore } from './token-store'
import type { PublicUser } from '../../shared/types'

function fakeStore() {
  let rec: any = undefined
  return {
    get: vi.fn(() => rec),
    set: vi.fn((_k: string, v: any) => { rec = v }),
    delete: vi.fn(() => { rec = undefined })
  }
}
// XOR-with-marker "encryption" so we can assert ciphertext != plaintext.
const realSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from('enc:' + s, 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, '')
}
const user: PublicUser = { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: null, status: 'active' }

describe('TokenStore (encryption available)', () => {
  it('round-trips a token without persisting plaintext', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: realSafe, store })
    expect(ts.save('secret-bearer')).toBe(true)
    const persisted = JSON.stringify(store.set.mock.calls[0][1])
    expect(persisted).not.toContain('secret-bearer') // base64 of ciphertext only
    expect(ts.load()).toBe('secret-bearer')
  })
  it('clear wipes token and user', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: realSafe, store })
    ts.save('t'); ts.saveUser(user)
    ts.clear()
    expect(ts.load()).toBeNull()
    expect(ts.loadUser()).toBeNull()
  })
})

describe('TokenStore (encryption UNAVAILABLE — fail closed)', () => {
  const noSafe = { ...realSafe, isEncryptionAvailable: () => false }
  it('keeps token memory-only and never writes tokenEnc', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: noSafe, store })
    expect(ts.save('secret')).toBe(false)
    // current run can still use it from memory
    expect(ts.load()).toBe('secret')
    // but nothing was persisted to disk
    const lastSet = store.set.mock.calls.at(-1)?.[1]
    expect(lastSet?.tokenEnc).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/token-store.test.ts`
Expected: FAIL — `./token-store` not found.

- [ ] **Step 3: Write minimal implementation**

First, update the app-store schema:

```ts
// src/main/services/app-store.ts
import Store from 'electron-store'
import type { UserSettings, PublicUser } from '../../shared/types'

export type CachedUser = PublicUser

export interface AuthRecord {
  tokenEnc?: string
  user?: CachedUser
}

export interface AppStoreSchema {
  settings: UserSettings
  auth: AuthRecord
}

export const appStore = new Store<AppStoreSchema>({
  defaults: {
    settings: {
      language: 'en'
    },
    auth: {}
  }
})
```

(Note: `theme` is removed from the settings default here as part of Task 1D-4's `UserSettings` change; if executing 1B before 1D, leave `theme: 'tropical'` in the default until 1D-4 lands — the schema only needs the `auth` key added for this task. Prefer landing 1D-4's type change first, or keep both fields temporarily.)

Then the token store:

```ts
// src/main/auth/token-store.ts
// CachedUser / AuthRecord are defined once in app-store.ts (single source of truth).
import type { CachedUser, AuthRecord } from '../services/app-store'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}

export interface AuthStoreLike {
  get(key: 'auth'): AuthRecord | undefined
  set(key: 'auth', value: AuthRecord): void
  delete(key: 'auth'): void
}

/**
 * Bearer storage. Encrypts via safeStorage and persists base64 under `auth`.
 * FAIL CLOSED: if encryption is unavailable, the token is held in memory for
 * the current run only and is never written to disk in plaintext.
 */
export class TokenStore {
  private memoryToken: string | null = null
  constructor(private deps: { safeStorage: SafeStorageLike; store: AuthStoreLike }) {}

  isEncryptionAvailable(): boolean {
    return this.deps.safeStorage.isEncryptionAvailable()
  }

  /** @returns true if the token was persisted encrypted, false if memory-only. */
  save(token: string): boolean {
    this.memoryToken = token
    if (!this.deps.safeStorage.isEncryptionAvailable()) {
      // Fail closed: keep in memory, do NOT write plaintext.
      const rec = this.deps.store.get('auth') ?? {}
      this.deps.store.set('auth', { ...rec, tokenEnc: undefined })
      return false
    }
    const enc = this.deps.safeStorage.encryptString(token).toString('base64')
    const rec = this.deps.store.get('auth') ?? {}
    this.deps.store.set('auth', { ...rec, tokenEnc: enc })
    return true
  }

  load(): string | null {
    if (this.memoryToken) return this.memoryToken
    const rec = this.deps.store.get('auth')
    if (!rec?.tokenEnc) return null
    if (!this.deps.safeStorage.isEncryptionAvailable()) return null
    try {
      const token = this.deps.safeStorage.decryptString(Buffer.from(rec.tokenEnc, 'base64'))
      this.memoryToken = token
      return token
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    this.memoryToken = null
    this.deps.store.set('auth', {})
  }

  saveUser(user: CachedUser): void {
    const rec = this.deps.store.get('auth') ?? {}
    this.deps.store.set('auth', { ...rec, user })
  }

  loadUser(): CachedUser | null {
    return this.deps.store.get('auth')?.user ?? null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/token-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/services/app-store.ts src/main/auth/token-store.ts src/main/auth/token-store.test.ts
git commit -m "feat(auth): fail-closed safeStorage token store + auth key in app-store"
```

---

### Task 1B-4: Auth HTTP client (exchange / get-session / device / revoke) with token redaction

**Files:**
- Create: `src/main/auth/auth-client.ts`
- Test: `src/main/auth/auth-client.test.ts`

**Interfaces:**
- Consumes: global `fetch` (Node 18+/Electron 42 has it), `AuthConfig.webBaseUrl`, the contract routes. PublicUser/AuthProvider from `shared/types`.
- Produces an `AuthClient` class constructed with `new AuthClient(baseUrl: string, fetchImpl?: typeof fetch)`:
  - `buildStartUrl(state: string, codeChallenge: string, provider: 'google'|'github'): string` → `${base}/desktop/auth/start?state=&cc=&provider=`.
  - `buildDeviceVerificationUrl(): string` → `${base}/device`.
  - `buildProfileUrl(user: PublicUser): string` → `${base}/profile/id/<user.id>` (the web's id-based entry route, which resolves the user server-side and redirects to the canonical `/profile/<username>.<uid>` handle — so the link never breaks when the username changes, §6.4).
  - `avatarUrl(user: PublicUser): string` → `${base}/api/avatar/<id>?v=<avatarVersion>`.
  - `exchange(args: { state: string; code: string; codeVerifier: string }): Promise<{ token: string; user: PublicUser }>`.
  - `getSession(token: string): Promise<{ user: PublicUser } | null>` — `null` on 401 or `status: banned|deleted`.
  - `requestDeviceCode(): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }>`.
  - `pollDeviceToken(deviceCode: string): Promise<{ kind: 'pending' } | { kind: 'slow_down' } | { kind: 'token'; token: string; user: PublicUser } | { kind: 'expired' } | { kind: 'denied' } | { kind: 'error'; code?: string }>`.
  - `revoke(token: string): Promise<void>` — never throws.
  - `redact(s: string): string` — replaces bearer/grant-looking substrings for logs (used by AuthService too).
- All response parsing validated with small zod schemas; HTTP is **mocked** in unit tests (no real network until 1E).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/auth-client.test.ts`
Expected: FAIL — `./auth-client` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/auth-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/auth/auth-client.ts src/main/auth/auth-client.test.ts
git commit -m "feat(auth): main-process auth HTTP client with redaction"
```

---

### Task 1B-5: openExternal allowlist for 97437.dev auth/profile/device URLs

**Files:**
- Modify: `src/main/utils/url-policy.ts` (add `isAllowedAuthUrl`)
- Modify: `src/main/utils/url-policy.test.ts` (add cases)

**Interfaces:**
- Consumes: nothing new (pure predicate).
- Produces: `isAllowedAuthUrl(url: string, webBaseOrigin: string): boolean` — true only for `https://<webBaseOrigin>` URLs whose path is `/desktop/auth/start`, `/device`, or starts with `/profile/id/`. The AuthService passes these to `shell.openExternal` directly (not via the renderer-facing `safeOpenExternal`, which already allows all https). This keeps the auth flow's externally-opened URLs to the exact expected set per §6.1.

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// add to src/main/utils/url-policy.test.ts
import { isAllowedAuthUrl } from './url-policy'

describe('isAllowedAuthUrl', () => {
  const ORIGIN = 'https://97437.dev'
  it('allows the exact auth/device/profile paths on the web origin', () => {
    expect(isAllowedAuthUrl(`${ORIGIN}/desktop/auth/start?state=a&cc=b&provider=google`, ORIGIN)).toBe(true)
    expect(isAllowedAuthUrl(`${ORIGIN}/device`, ORIGIN)).toBe(true)
    expect(isAllowedAuthUrl(`${ORIGIN}/profile/id/u1`, ORIGIN)).toBe(true)
  })
  it('rejects other paths, other origins, and non-https', () => {
    expect(isAllowedAuthUrl(`${ORIGIN}/admin`, ORIGIN)).toBe(false)
    expect(isAllowedAuthUrl('https://evil.example/desktop/auth/start', ORIGIN)).toBe(false)
    expect(isAllowedAuthUrl('http://97437.dev/device', ORIGIN)).toBe(false)
    expect(isAllowedAuthUrl('custos://auth/callback?state=a&code=b', ORIGIN)).toBe(false)
    expect(isAllowedAuthUrl('not a url', ORIGIN)).toBe(false)
  })
  it('accepts a localhost dev origin when that is the configured base', () => {
    const DEV = 'http://localhost:3000'
    expect(isAllowedAuthUrl(`${DEV}/device`, DEV)).toBe(true)
    expect(isAllowedAuthUrl(`${ORIGIN}/device`, DEV)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/utils/url-policy.test.ts`
Expected: FAIL — `isAllowedAuthUrl` not exported.

- [ ] **Step 3: Write minimal implementation (append to url-policy.ts)**

```ts
/**
 * True only for the exact set of 97437.dev URLs the auth flow may open in the
 * system browser: /desktop/auth/start, /device, and /profile/id/<id> profile links.
 * The scheme must match the configured base (https in prod; http://localhost
 * for dev). Used by AuthService, NOT by the general safeOpenExternal path.
 */
export function isAllowedAuthUrl(url: string, webBase: string): boolean {
  let target: URL
  let base: URL
  try {
    target = new URL(url)
    base = new URL(webBase)
  } catch {
    return false
  }
  if (target.protocol !== base.protocol) return false
  if (target.host !== base.host) return false
  const p = target.pathname
  return p === '/desktop/auth/start' || p === '/device' || p.startsWith('/profile/id/')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/utils/url-policy.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/url-policy.ts src/main/utils/url-policy.test.ts
git commit -m "feat(auth): openExternal allowlist for 97437.dev auth/device/profile URLs"
```

---

### Task 1B-6: Strict `custos://` callback parser

**Files:**
- Create: `src/main/auth/callback-parser.ts`
- Test: `src/main/auth/callback-parser.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `parseCallback(url: string): { state: string; code: string } | null` — accepts ONLY `custos://auth/callback?state=&code=` with both non-empty; returns `null` for any other scheme/host/path/missing/garbage.
  - `findCallbackInArgv(argv: string[]): string | null` — returns the first `custos://...` arg in a `second-instance` argv array (Windows), else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/auth/callback-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseCallback, findCallbackInArgv } from './callback-parser'

describe('parseCallback', () => {
  it('accepts a well-formed callback', () => {
    expect(parseCallback('custos://auth/callback?state=abc&code=xyz')).toEqual({ state: 'abc', code: 'xyz' })
  })
  it('rejects wrong scheme/host/path', () => {
    expect(parseCallback('https://auth/callback?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://evil/callback?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://auth/other?state=a&code=b')).toBeNull()
  })
  it('rejects missing or empty params', () => {
    expect(parseCallback('custos://auth/callback?state=a')).toBeNull()
    expect(parseCallback('custos://auth/callback?code=b')).toBeNull()
    expect(parseCallback('custos://auth/callback?state=&code=b')).toBeNull()
    expect(parseCallback('custos://auth/callback')).toBeNull()
  })
  it('rejects junk', () => {
    expect(parseCallback('not a url')).toBeNull()
    expect(parseCallback('')).toBeNull()
  })
})

describe('findCallbackInArgv', () => {
  it('finds the custos:// arg among Windows argv', () => {
    expect(findCallbackInArgv(['app.exe', '--flag', 'custos://auth/callback?state=a&code=b']))
      .toBe('custos://auth/callback?state=a&code=b')
  })
  it('returns null when absent', () => {
    expect(findCallbackInArgv(['app.exe', '--flag'])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/callback-parser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/auth/callback-parser.ts

/**
 * Strictly parse a custos:// deep link. Accepts ONLY
 * custos://auth/callback?state=<nonempty>&code=<nonempty>. Everything else
 * (scheme/host/path/missing/garbage) returns null and must be rejected.
 */
export function parseCallback(url: string): { state: string; code: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'custos:') return null
  if (u.host !== 'auth') return null
  if (u.pathname !== '/callback') return null
  const state = u.searchParams.get('state')
  const code = u.searchParams.get('code')
  if (!state || !code) return null
  return { state, code }
}

/** Find a custos:// callback in a Windows second-instance argv array. */
export function findCallbackInArgv(argv: string[]): string | null {
  return argv.find((a) => a.startsWith('custos://')) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/callback-parser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/auth/callback-parser.ts src/main/auth/callback-parser.test.ts
git commit -m "feat(auth): strict custos:// callback parser + argv finder"
```

---

### Task 1B-7: Shared auth types + AuthService state machine

**Files:**
- Modify: `src/shared/types.ts` (add the shared auth types + IPC channels)
- Create: `src/main/auth/auth-service.ts`
- Test: `src/main/auth/auth-service.test.ts`

**Interfaces:**
- Consumes: `generatePkce`/`generateState`/`sha256Base64Url` (1B-1), `TokenStore` (1B-3), `AuthClient` + `DevicePollResult` (1B-4), `parseCallback` (1B-6), `AuthConfig` (1B-2).
- Produces the `AuthService` class with injectable deps for testability:
  - `new AuthService(deps: { client: AuthClient; tokens: TokenStore; config: AuthConfig; openExternal: (url: string) => void; onChange: (s: AuthState) => void })` (the concrete `AuthServiceDeps` interface is declared in Step 4 below).
  - `getState(): AuthState`.
  - `login(provider: AuthProvider): Promise<void>` — google/github start browser OAuth + set `pendingAuth` + 90s timeout→device offer; `device` runs the device flow.
  - `handleCallback(url: string): Promise<void>` — parse strictly, match `state`, exchange, persist, emit.
  - `cancel(): Promise<void>` — clears pending, returns to prior authed/anon.
  - `logout(): Promise<void>` — local wipe first, best-effort revoke.
  - `validateOnStartup(): Promise<void>` — load cached user (display-only), call get-session; on `null` wipe→anon silently.
  - Emits `AuthState` via `onChange`. **Encryption-unavailable** sets a transient flag surfaced in `device`/copy.
- Adds the shared auth types AND new IPC channels to `shared/types.ts`.

- [ ] **Step 1: Add shared types + channels to `src/shared/types.ts`**

Append after the existing `UserSettings` interface region (and extend `IPC_CHANNELS`):

```ts
// ── Shared auth identity model (token-free; renderer-facing) ──────────────────
export interface PublicUser {
  id: string
  username: string
  uid: number
  avatarVersion: number
  role: string | null
  status: 'active' | 'banned' | 'deleted'
  image?: string | null
}
export type AuthStatus = 'anon' | 'pending' | 'authed'
export type DeviceStatus =
  | 'requesting' | 'awaiting-approval' | 'polling' | 'denied' | 'expired' | 'error'
export interface DeviceProgress {
  status: DeviceStatus
  userCode?: string
  verificationUri?: string
}
export interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  device?: DeviceProgress
  /** True when safeStorage is unavailable → token is memory-only this run (§4.7). */
  encryptionUnavailable?: boolean
}
export type AuthProvider = 'google' | 'github' | 'device'
```

In the `IPC_CHANNELS` object add an `// Auth` group:

```ts
  // Auth
  AUTH_GET_STATE: 'auth:get-state',
  AUTH_LOGIN: 'auth:login',
  AUTH_CANCEL: 'auth:cancel',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CHANGED: 'auth:changed',
```

- [ ] **Step 2: Write the failing test**

```ts
// src/main/auth/auth-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/main/auth/auth-service.test.ts`
Expected: FAIL — `./auth-service` not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/main/auth/auth-service.ts
import { generateState, generatePkce } from './pkce'
import { parseCallback } from './callback-parser'
import type { AuthClient } from './auth-client'
import type { TokenStore } from './token-store'
import type { AuthConfig } from '../services/config-service'
import type { AuthState, AuthProvider, PublicUser, DeviceProgress } from '../../shared/types'

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
  now?: () => number
}

export class AuthService {
  private status: AuthState['status'] = 'anon'
  private user: PublicUser | null = null
  private device: DeviceProgress | undefined = undefined
  private encryptionUnavailable = false
  private pendingAuth: PendingAuth | null = null

  constructor(private deps: AuthServiceDeps) {}

  getState(): AuthState {
    return {
      status: this.status,
      user: this.user,
      device: this.device,
      encryptionUnavailable: this.encryptionUnavailable || undefined
    }
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
    this.deps.openExternal(this.deps.client.buildStartUrl(state, codeChallenge, provider))
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
      const { token, user } = await this.deps.client.exchange({ state, code: parsed.code, codeVerifier })
      this.completeAuth(token, user)
    } catch {
      this.clearPending()
      this.settleToBaseline()
      this.emit()
    }
  }

  private completeAuth(token: string, user: PublicUser): void {
    this.clearPending()
    const persisted = this.deps.tokens.save(token)
    this.encryptionUnavailable = !persisted
    this.deps.tokens.saveUser(user)
    this.user = user
    this.status = 'authed'
    this.device = undefined
    this.emit()
  }

  async cancel(): Promise<void> {
    this.clearPending()
    this.settleToBaseline()
    this.emit()
  }

  async logout(): Promise<void> {
    const token = this.deps.tokens.load()
    // Local wipe FIRST (guaranteed, never blocked) — §4.10
    this.deps.tokens.clear()
    this.clearPending()
    this.user = null
    this.status = 'anon'
    this.device = undefined
    this.encryptionUnavailable = false
    this.emit()
    // Best-effort server revoke (non-blocking, never throws)
    if (token) void this.deps.client.revoke(token)
  }

  async validateOnStartup(): Promise<void> {
    if (!this.deps.config.enabled) return
    const token = this.deps.tokens.load()
    if (!token) { this.status = 'anon'; this.user = null; return }
    // Cached user is display-only; show it briefly to avoid a logged-out flash.
    this.user = this.deps.tokens.loadUser()
    this.status = this.user ? 'authed' : 'anon'
    this.emit()
    const session = await this.deps.client.getSession(token)
    if (!session) {
      // banned/deleted/401 → silent wipe → anonymous (§4.5)
      this.deps.tokens.clear()
      this.user = null
      this.status = 'anon'
      this.emit()
      return
    }
    this.user = session.user
    this.deps.tokens.saveUser(session.user)
    this.status = 'authed'
    this.emit()
  }

  private async runDeviceFlow(): Promise<void> {
    this.device = { status: 'requesting' }
    this.status = 'pending'
    this.emit()
    let code
    try {
      code = await this.deps.client.requestDeviceCode()
    } catch {
      this.device = { status: 'error' }
      this.status = this.user ? 'authed' : 'anon'
      this.emit()
      return
    }
    this.device = { status: 'awaiting-approval', userCode: code.userCode, verificationUri: code.verificationUri }
    this.emit()
    this.deps.openExternal(this.deps.client.buildDeviceVerificationUrl())
    await this.pollDevice(code.deviceCode, code.interval, Date.now())
  }

  private async pollDevice(deviceCode: string, intervalSec: number, startedAt: number): Promise<void> {
    let intervalMs = Math.max(1, intervalSec) * 1000
    // Bounded loop (§4.4): honor interval, back off on slow_down, cap duration.
    while (Date.now() - startedAt < DEVICE_MAX_DURATION_MS) {
      await new Promise((r) => setTimeout(r, intervalMs))
      const res = await this.deps.client.pollDeviceToken(deviceCode)
      if (res.kind === 'token') { this.completeAuth(res.token, res.user); return }
      if (res.kind === 'slow_down') { intervalMs += 5000; continue }
      if (res.kind === 'pending') { this.device = { status: 'polling', userCode: this.device?.userCode, verificationUri: this.device?.verificationUri }; this.emit(); continue }
      if (res.kind === 'denied') { this.device = { status: 'denied' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return }
      if (res.kind === 'expired') { this.device = { status: 'expired' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return }
      this.device = { status: 'error' }; this.status = this.user ? 'authed' : 'anon'; this.emit(); return
    }
    this.device = { status: 'expired' } // max duration hit → treat as expired
    this.status = this.user ? 'authed' : 'anon'
    this.emit()
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/main/auth/auth-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/auth/auth-service.ts src/main/auth/auth-service.test.ts
git commit -m "feat(auth): AuthService state machine + shared auth types + IPC channels"
```

---

### Task 1B-8: Protocol registration + single-instance + IPC handlers + preload bridge

**Files:**
- Modify: `src/main/index.ts` (protocol registration, single-instance lock, `second-instance`/`open-url`, construct AuthService, startup validation)
- Modify: `src/main/ipc-handlers.ts` (register the four auth handlers + the `auth:changed` push wiring)
- Modify: `src/preload/index.ts` (add the five auth methods)
- Modify: `src/shared/global.d.ts` (no change needed — `ElectronAPI` is `typeof api`; verify it still resolves)
- Test: `src/main/auth/auth-ipc.test.ts` (zod-validation of the login payload)

**Interfaces:**
- Consumes: `AuthService` (1B-7), `IPC_CHANNELS.AUTH_*`, `AuthProvider`/`AuthState` (1B-7).
- Produces:
  - In `ipc-handlers.ts`: a `setupAuthHandlers(mainWindow, authService)` that registers `AUTH_GET_STATE` → `authService.getState()`; `AUTH_LOGIN` ← validates `{ provider }` with zod (`z.enum(['google','github','device'])`) then `authService.login`; `AUTH_CANCEL` → `cancel`; `AUTH_LOGOUT` → `logout`; and subscribes `authService` `onChange` to push `AUTH_CHANGED` to the renderer.
  - In `preload/index.ts`: `getAuthState(): Promise<AuthState>`, `login(provider: AuthProvider): Promise<void>`, `cancelLogin(): Promise<void>`, `logout(): Promise<void>`, `onAuthChanged(cb: (s: AuthState) => void): () => void`.
- Note: AuthService's `onChange` must be wired in `index.ts` (it constructs AuthService with `onChange` that calls `mainWindow.webContents.send(IPC_CHANNELS.AUTH_CHANGED, state)` via a safe-send guard). The zod login-payload validator is the unit-testable piece.

- [ ] **Step 1: Write the failing test (the validation guard)**

```ts
// src/main/auth/auth-ipc.test.ts
import { describe, it, expect } from 'vitest'
import { AuthLoginPayloadSchema } from './auth-ipc-schema'

describe('AuthLoginPayloadSchema', () => {
  it('accepts the three valid providers', () => {
    for (const provider of ['google', 'github', 'device'] as const) {
      expect(AuthLoginPayloadSchema.safeParse({ provider }).success).toBe(true)
    }
  })
  it('rejects unknown providers and extra keys', () => {
    expect(AuthLoginPayloadSchema.safeParse({ provider: 'facebook' }).success).toBe(false)
    expect(AuthLoginPayloadSchema.safeParse({ provider: 'google', extra: 1 }).success).toBe(false)
    expect(AuthLoginPayloadSchema.safeParse({}).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/auth-ipc.test.ts`
Expected: FAIL — `./auth-ipc-schema` not found.

- [ ] **Step 3: Write minimal implementation**

Create the schema module:

```ts
// src/main/auth/auth-ipc-schema.ts
import { z } from 'zod'

/** Validates the auth:login renderer payload at the IPC boundary. */
export const AuthLoginPayloadSchema = z.object({
  provider: z.enum(['google', 'github', 'device'])
}).strict()
```

Add the auth handler registration to `ipc-handlers.ts` (import the schema + `AuthService` type + channels). Add near the bottom of the file:

```ts
import { AuthLoginPayloadSchema } from './auth/auth-ipc-schema'
import type { AuthService } from './auth/auth-service'
import type { AuthState } from '../shared/types'

export function setupAuthHandlers(mainWindow: BrowserWindow, authService: AuthService): void {
  const safeSend = (channel: string, data: unknown): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data)
  }

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, (): AuthState => authService.getState())

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_e, payload: unknown): Promise<void> => {
    const parsed = AuthLoginPayloadSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid login payload: ${parsed.error.message}`)
    await authService.login(parsed.data.provider)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CANCEL, async (): Promise<void> => authService.cancel())
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<void> => authService.logout())

  // Push state changes to the renderer.
  void safeSend // pushes happen via the onChange wired in index.ts
}
```

(The `onChange`→`AUTH_CHANGED` push is wired in `index.ts` where AuthService is constructed; `setupAuthHandlers` registers the request/response handlers. Keep them together so a single import in `index.ts` wires both.)

In `src/main/index.ts`, before `app.whenReady()`, add protocol + single-instance handling and construct AuthService. Replace the dead `themeColors`/`savedTheme`/`bgColor` block (also touched in 1D-5) and add:

```ts
import { app, BrowserWindow, safeStorage } from 'electron'
import { setupAuthHandlers } from './ipc-handlers'
import { AuthService } from './auth/auth-service'
import { AuthClient } from './auth/auth-client'
import { TokenStore } from './auth/token-store'
import { configService } from './services/config-service'
import { parseCallback, findCallbackInArgv } from './auth/callback-parser'
import { IPC_CHANNELS } from '../shared/types'
import { isAllowedAuthUrl } from './utils/url-policy'
import { shell } from 'electron'

let authService: AuthService | null = null

// Register custos:// as the default protocol client (Windows deep-link return).
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('custos', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('custos')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const cb = findCallbackInArgv(argv)
    if (cb && authService) void authService.handleCallback(cb)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  // macOS dev parity: open-url delivers the deep link directly.
  app.on('open-url', (_e, url) => {
    if (authService) void authService.handleCallback(url)
  })
}
```

In `createWindow()`, after `setupIpcHandlers(mainWindow)`, construct + wire AuthService:

```ts
  const authConfig = configService.loadAuthConfig()
  authService = new AuthService({
    client: new AuthClient(authConfig.webBaseUrl),
    tokens: new TokenStore({ safeStorage, store: appStore as never }),
    config: authConfig,
    openExternal: (url) => {
      // Only the exact 97437.dev auth/device/profile URLs may be opened.
      if (isAllowedAuthUrl(url, authConfig.webBaseUrl)) {
        void shell.openExternal(url)
      } else {
        logger.warn('Blocked auth openExternal (not allowlisted)')
      }
    },
    onChange: (state) => {
      if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send(IPC_CHANNELS.AUTH_CHANGED, state)
    }
  })
  setupAuthHandlers(mainWindow, authService)
```

After the window loads (e.g. inside `app.whenReady().then(...)` after `createWindow()`), kick off startup validation: `void authService?.validateOnStartup()`.

Add the preload methods to the `api` object in `src/preload/index.ts`:

```ts
import type { AuthState, AuthProvider } from '../shared/types'
export type AuthChangedCallback = (state: AuthState) => void

  // ── Auth (token-free; all networking in main) ──────────────────────────────
  getAuthState: (): Promise<AuthState> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),
  login: (provider: AuthProvider): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, { provider }),
  cancelLogin: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CANCEL),
  logout: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  onAuthChanged: (callback: AuthChangedCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AuthState): void => callback(state)
    ipcRenderer.on(IPC_CHANNELS.AUTH_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_CHANGED, listener)
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/auth-ipc.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the main + preload wiring**

Run: `npm run typecheck`
Expected: PASS (no type errors from the new imports/handlers).

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/ipc-handlers.ts src/preload/index.ts src/main/auth/auth-ipc-schema.ts src/main/auth/auth-ipc.test.ts
git commit -m "feat(auth): custos:// protocol + single-instance + auth IPC handlers + preload bridge"
```

---

## Phase 1C (renderer UI)

### Task 1C-1: auth-store (zustand) hydrate + subscribe

**Files:**
- Create: `src/renderer/stores/auth-store.ts`
- Test: `src/renderer/stores/auth-store.test.ts`

**Interfaces:**
- Consumes: `window.electronAPI.getAuthState/login/cancelLogin/logout/onAuthChanged` (1B-8), `AuthState`/`AuthProvider`/`PublicUser` (shared types).
- Produces a zustand store `useAuthStore` with state `{ status, user, device, encryptionUnavailable, isLoaded }` and actions `init(): Promise<void>` (hydrate via `getAuthState()` + subscribe `onAuthChanged`), `login(provider)`, `cancel()`, `logout()`, plus internal `_apply(state: AuthState)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stores/auth-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthState } from '../../shared/types'

const authed: AuthState = {
  status: 'authed',
  user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' }
}

let changedCb: ((s: AuthState) => void) | null = null
beforeEach(() => {
  changedCb = null
  ;(globalThis as any).window = {
    electronAPI: {
      getAuthState: vi.fn(async () => ({ status: 'anon', user: null }) as AuthState),
      login: vi.fn(async () => {}),
      cancelLogin: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      onAuthChanged: vi.fn((cb: any) => { changedCb = cb; return () => {} })
    }
  }
  vi.resetModules()
})

describe('useAuthStore', () => {
  it('hydrates from getAuthState and applies pushed changes', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().status).toBe('anon')
    expect(useAuthStore.getState().isLoaded).toBe(true)
    changedCb?.(authed)
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.username).toBe('neo')
  })
  it('login delegates to electronAPI', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('github')
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('github')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stores/auth-store.test.ts`
Expected: FAIL — `./auth-store` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/stores/auth-store.ts
import { create } from 'zustand'
import type { AuthState, AuthProvider, PublicUser, DeviceProgress } from '../../shared/types'

interface AuthStore {
  status: AuthState['status']
  user: PublicUser | null
  device?: DeviceProgress
  encryptionUnavailable: boolean
  isLoaded: boolean
  init: () => Promise<void>
  login: (provider: AuthProvider) => Promise<void>
  cancel: () => Promise<void>
  logout: () => Promise<void>
  _apply: (state: AuthState) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'anon',
  user: null,
  device: undefined,
  encryptionUnavailable: false,
  isLoaded: false,

  _apply: (state) =>
    set({
      status: state.status,
      user: state.user,
      device: state.device,
      encryptionUnavailable: !!state.encryptionUnavailable
    }),

  init: async () => {
    window.electronAPI.onAuthChanged((s) => useAuthStore.getState()._apply(s))
    try {
      const state = await window.electronAPI.getAuthState()
      useAuthStore.getState()._apply(state)
    } catch {
      // leave defaults (anon) — scanner is unaffected (PR-1)
    }
    set({ isLoaded: true })
  },

  login: (provider) => window.electronAPI.login(provider),
  cancel: () => window.electronAPI.cancelLogin(),
  logout: () => window.electronAPI.logout()
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stores/auth-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `init()` into App.tsx**

In `src/renderer/App.tsx`, add `import { useAuthStore } from './stores/auth-store'`, then inside `App()` add an effect: `useEffect(() => { useAuthStore.getState().init() }, [])`. (No blocking gate — login is optional, PR-1.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stores/auth-store.ts src/renderer/stores/auth-store.test.ts src/renderer/App.tsx
git commit -m "feat(auth): renderer auth-store + App init wiring"
```

---

### Task 1C-2: Avatar primitive (image + initials fallback, no-token URL)

**Files:**
- Create: `src/renderer/components/ui/Avatar.tsx`
- Test: `src/renderer/components/ui/Avatar.test.tsx`

**Interfaces:**
- Consumes: `PublicUser`, `cn()`.
- Produces `<Avatar user={PublicUser} size?={number} className?={string} />`. The renderer must NOT know `WEB_BASE_URL`, so it never builds an avatar URL itself: the main process already normalized `user.image` to the canonical, token-free avatar endpoint (`${WEB_BASE_URL}/api/avatar/<id>?v=<avatarVersion>`) via `AuthClient.withAvatar()` (Task 1B-4). The component therefore renders `user.image` directly and falls back to initials when `image` is missing/null or the `<img>` fires `onError` (§6.5). No token-like material is ever present in the URL (the endpoint is public and version-keyed).

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/ui/Avatar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Avatar } from './Avatar'
import type { PublicUser } from '../../../shared/types'

const base: PublicUser = { id: 'u1', username: 'Neo', uid: 7, avatarVersion: 1, role: null, status: 'active' }

describe('Avatar', () => {
  it('renders initials when there is no image', () => {
    render(<Avatar user={base} />)
    expect(screen.getByText('N')).toBeTruthy()
  })
  it('renders the public image when provided and never embeds a token', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('/api/avatar/u1?v=1')
    expect(img.src.toLowerCase()).not.toContain('bearer')
    expect(img.src.toLowerCase()).not.toContain('token')
  })
  it('falls back to initials on image load error', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('N')).toBeTruthy()
  })
})
```

Note: this requires `@testing-library/react` + `jsdom`. Add to devDependencies and set the test file's environment. Add at the top of the test file a vitest pragma comment: `// @vitest-environment jsdom`. Install deps: `npm i -D @testing-library/react @testing-library/jest-dom jsdom`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/ui/Avatar.test.tsx`
Expected: FAIL — `./Avatar` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/components/ui/Avatar.tsx
import { useState } from 'react'
import type { PublicUser } from '../../../shared/types'
import { cn } from '../../utils/cn'

interface AvatarProps {
  user: PublicUser
  size?: number
  className?: string
}

function initials(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

/**
 * User avatar. Loads the public, token-free image from user.image when present
 * and falls back to initials on missing/failed load (§6.5). The image URL is
 * the public /api/avatar/<id>?v=<v> endpoint — never carries a bearer/grant.
 */
export function Avatar({ user, size = 28, className }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!user.image && !failed
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden bg-panel-2 text-ink font-display font-bold select-none',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden={false}
    >
      {showImage ? (
        <img
          src={user.image!}
          alt={user.username}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={user.username}>{initials(user.username)}</span>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/ui/Avatar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui/Avatar.tsx src/renderer/components/ui/Avatar.test.tsx package.json package-lock.json
git commit -m "feat(auth): Avatar primitive with token-free image + initials fallback"
```

---

### Task 1C-3: RoleName primitive (role-colored)

**Files:**
- Create: `src/renderer/components/ui/RoleName.tsx`
- Test: `src/renderer/components/ui/RoleName.test.tsx`

**Interfaces:**
- Consumes: `cn()`.
- Produces `<RoleName username={string} role={string | null} className?={string} />` — renders the username with a role-driven CSS class (matching web's `.role-glow` convention): `admin` → caramel glow, `mod`/`moderator` → amber, else plain ink. Pure styling; no networking.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/ui/RoleName.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoleName } from './RoleName'

describe('RoleName', () => {
  it('renders the username', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo')).toBeTruthy()
  })
  it('applies a role glow class for admin', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo').className).toContain('text-scan')
  })
  it('renders plain ink for a null role', () => {
    render(<RoleName username="anon" role={null} />)
    expect(screen.getByText('anon').className).toContain('text-ink')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/ui/RoleName.test.tsx`
Expected: FAIL — `./RoleName` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/components/ui/RoleName.tsx
import { cn } from '../../utils/cn'

interface RoleNameProps {
  username: string
  role: string | null
  className?: string
}

/** Username with a role-driven color/glow (mirrors web .role-glow). */
export function RoleName({ username, role, className }: RoleNameProps) {
  const r = (role ?? '').toLowerCase()
  const roleClass =
    r === 'admin' ? 'text-scan text-glow'
    : r === 'mod' || r === 'moderator' ? 'text-amber'
    : 'text-ink'
  return <span className={cn('font-display font-semibold', roleClass, className)}>{username}</span>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/ui/RoleName.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui/RoleName.tsx src/renderer/components/ui/RoleName.test.tsx
git commit -m "feat(auth): RoleName primitive (role-colored username)"
```

---

### Task 1C-4: Error-copy i18n keys (en + ru)

**Files:**
- Modify: `src/renderer/i18n/en.json` (add `auth` block)
- Modify: `src/renderer/i18n/ru.json` (add `auth` block)
- Test: `src/renderer/i18n/auth-keys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces an `auth` i18n namespace covering §9 copy + UI labels, identical key sets in en + ru. Keys: `signIn`, `signOut`, `openProfile`, `continueGoogle`, `continueGithub`, `useCode`, `enterCodeAt`, `yourCode`, `waitingApproval`, and error keys `loginFailed`, `callbackBlocked`, `deviceExpired`, `serverUnavailable`, `encryptionUnavailable`, `signedOut`, `retry`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/i18n/auth-keys.test.ts
import { describe, it, expect } from 'vitest'
import en from './en.json'
import ru from './ru.json'

const REQUIRED = [
  'signIn', 'signOut', 'openProfile', 'continueGoogle', 'continueGithub',
  'useCode', 'enterCodeAt', 'yourCode', 'waitingApproval',
  'loginFailed', 'callbackBlocked', 'deviceExpired', 'serverUnavailable',
  'encryptionUnavailable', 'signedOut', 'retry'
]

describe('auth i18n keys', () => {
  it('en has every required auth key', () => {
    for (const k of REQUIRED) expect((en as any).auth?.[k], `en.auth.${k}`).toBeTruthy()
  })
  it('ru has the same key set as en', () => {
    expect(Object.keys((ru as any).auth ?? {}).sort()).toEqual(Object.keys((en as any).auth ?? {}).sort())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/i18n/auth-keys.test.ts`
Expected: FAIL — `en.auth` undefined.

- [ ] **Step 3: Write minimal implementation**

Add to `en.json` (top-level, e.g. after `"promo"`):

```json
"auth": {
  "signIn": "Sign in",
  "signOut": "Sign out",
  "openProfile": "Open profile on web",
  "continueGoogle": "Continue with Google",
  "continueGithub": "Continue with GitHub",
  "useCode": "Use a sign-in code instead",
  "enterCodeAt": "Enter this code at {{url}}",
  "yourCode": "Your sign-in code",
  "waitingApproval": "Waiting for you to approve in your browser…",
  "loginFailed": "Couldn't complete sign-in. Try again.",
  "callbackBlocked": "Browser couldn't return to Custos — use a sign-in code instead.",
  "deviceExpired": "That code expired. Get a new one.",
  "serverUnavailable": "Can't reach 97437.dev right now. You can keep using Custos offline.",
  "encryptionUnavailable": "Secure storage isn't available, so you'll need to sign in again after restart.",
  "signedOut": "Signed out.",
  "retry": "Try again"
},
```

Add to `ru.json` (same position):

```json
"auth": {
  "signIn": "Войти",
  "signOut": "Выйти",
  "openProfile": "Открыть профиль на сайте",
  "continueGoogle": "Продолжить с Google",
  "continueGithub": "Продолжить с GitHub",
  "useCode": "Использовать код для входа",
  "enterCodeAt": "Введите этот код на {{url}}",
  "yourCode": "Ваш код для входа",
  "waitingApproval": "Ожидаем подтверждение в браузере…",
  "loginFailed": "Не удалось завершить вход. Попробуйте ещё раз.",
  "callbackBlocked": "Браузер не смог вернуться в Custos — используйте код для входа.",
  "deviceExpired": "Код истёк. Получите новый.",
  "serverUnavailable": "Сейчас не удаётся подключиться к 97437.dev. Можно продолжать работу офлайн.",
  "encryptionUnavailable": "Безопасное хранилище недоступно — после перезапуска потребуется войти заново.",
  "signedOut": "Вы вышли из аккаунта.",
  "retry": "Повторить"
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/i18n/auth-keys.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n/en.json src/renderer/i18n/ru.json src/renderer/i18n/auth-keys.test.ts
git commit -m "feat(auth): error-copy + label i18n keys (en + ru)"
```

---

### Task 1C-5: Login modal (Google/GitHub) + device-code panel

**Files:**
- Create: `src/renderer/components/auth/LoginModal.tsx`
- Create: `src/renderer/components/auth/IconGoogle.tsx`, `src/renderer/components/auth/IconGithub.tsx`
- Test: `src/renderer/components/auth/LoginModal.test.tsx`

**Interfaces:**
- Consumes: `Modal` (`ui/Modal.tsx`), `useAuthStore` (1C-1), `t()` keys (1C-4).
- Produces `<LoginModal isOpen onClose />`: two OAuth buttons (`auth.continueGoogle`, `auth.continueGithub`) styled per web OAuth convention (`rounded-xl border-line-strong bg-bg hover:border-scan hover:text-scan`), each calling `useAuthStore.getState().login('google'|'github')`. A quiet `auth.useCode` link calls `login('device')`. When `device` progress is present, render the device panel: `auth.yourCode` + `device.userCode`, `auth.enterCodeAt` with `device.verificationUri`, and a status line (`waitingApproval`/`deviceExpired`/`loginFailed`). When `encryptionUnavailable`, show the §9 encryption copy.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/auth/LoginModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LoginModal } from './LoginModal'
import { useAuthStore } from '../../stores/auth-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: any) => (o?.url ? `${k}:${o.url}` : k) })
}))

beforeEach(() => {
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, encryptionUnavailable: false, isLoaded: true } as any)
  ;(globalThis as any).window = (globalThis as any).window || {}
  ;(window as any).electronAPI = { login: vi.fn(async () => {}) }
})

describe('LoginModal', () => {
  it('shows both OAuth options and the device link', () => {
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('auth.continueGoogle')).toBeTruthy()
    expect(screen.getByText('auth.continueGithub')).toBeTruthy()
    expect(screen.getByText('auth.useCode')).toBeTruthy()
  })
  it('clicking Google calls login("google")', () => {
    render(<LoginModal isOpen onClose={() => {}} />)
    fireEvent.click(screen.getByText('auth.continueGoogle'))
    expect((window as any).electronAPI.login).toHaveBeenCalledWith('google')
  })
  it('renders the device code panel when device progress is present', () => {
    useAuthStore.setState({ device: { status: 'awaiting-approval', userCode: 'WXYZ-1234', verificationUri: 'https://97437.dev/device' } } as any)
    render(<LoginModal isOpen onClose={() => {}} />)
    expect(screen.getByText('WXYZ-1234')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/auth/LoginModal.test.tsx`
Expected: FAIL — `./LoginModal` not found.

- [ ] **Step 3: Write minimal implementation**

Create the two icon components (minimal inline SVGs):

```tsx
// src/renderer/components/auth/IconGoogle.tsx
export function IconGoogle({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 11v3.6h5.1c-.2 1.3-1.6 3.9-5.1 3.9a5.5 5.5 0 1 1 0-11c1.6 0 2.6.7 3.2 1.2l2.2-2.1A8.9 8.9 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 8.6-3.6 8.6-8.7 0-.6 0-1-.1-1.5H12z"/>
    </svg>
  )
}
```

```tsx
// src/renderer/components/auth/IconGithub.tsx
export function IconGithub({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .8 0-.6.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7 0-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.1 2.4.1 2.7.7.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .3.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>
    </svg>
  )
}
```

```tsx
// src/renderer/components/auth/LoginModal.tsx
import { useTranslation } from 'react-i18next'
import { Modal } from '../ui/Modal'
import { useAuthStore } from '../../stores/auth-store'
import { IconGoogle } from './IconGoogle'
import { IconGithub } from './IconGithub'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
}

const oauthBtn =
  'w-full flex items-center justify-center gap-3 h-11 rounded-xl border border-[color:var(--line-strong)] bg-bg text-ink font-display font-medium hover:border-scan hover:text-scan transition-colors'

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { t } = useTranslation()
  const { device, encryptionUnavailable, login } = useAuthStore()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('auth.signIn')} size="sm">
      <div className="space-y-3">
        <button className={oauthBtn} onClick={() => login('google')}>
          <IconGoogle /> {t('auth.continueGoogle')}
        </button>
        <button className={oauthBtn} onClick={() => login('github')}>
          <IconGithub /> {t('auth.continueGithub')}
        </button>

        {encryptionUnavailable && (
          <p className="text-xs text-amber">{t('auth.encryptionUnavailable')}</p>
        )}

        {device ? (
          <div className="mt-2 rounded-xl border border-[color:var(--line)] bg-panel-2 p-3 text-center">
            <p className="text-2xs uppercase tracking-wide text-ink-dim">{t('auth.yourCode')}</p>
            {device.userCode && (
              <p className="my-1 text-xl font-mono tracking-widest text-scan">{device.userCode}</p>
            )}
            {device.verificationUri && (
              <p className="text-xs text-ink-dim">{t('auth.enterCodeAt', { url: device.verificationUri })}</p>
            )}
            <p className="mt-2 text-xs text-ink-dim">
              {device.status === 'expired' ? t('auth.deviceExpired')
                : device.status === 'denied' || device.status === 'error' ? t('auth.loginFailed')
                : t('auth.waitingApproval')}
            </p>
          </div>
        ) : (
          <button
            className="w-full text-center text-xs text-ink-dim hover:text-scan transition-colors mt-1"
            onClick={() => login('device')}
          >
            {t('auth.useCode')}
          </button>
        )}
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/auth/LoginModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/auth/
git commit -m "feat(auth): login modal with OAuth buttons + device-code panel"
```

---

### Task 1C-6: Header user cluster (sign-in / avatar + dropdown) + profile open

**Files:**
- Create: `src/renderer/components/auth/UserMenu.tsx`
- Modify: `src/renderer/components/layout/Header.tsx` (mount the cluster right of the OS pill)
- Test: `src/renderer/components/auth/UserMenu.test.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (1C-1), `Avatar` (1C-2), `RoleName` (1C-3), `LoginModal` (1C-5), `t()` keys (1C-4), `window.electronAPI.openExternal` (existing).
- Produces `<UserMenu />`: when `status==='anon'`, a `auth.signIn` button that opens `LoginModal`; when `status==='authed'`, the `Avatar` + a dropdown with `RoleName`, role badge, `auth.openProfile` (opens profile on web — see note), and `auth.signOut` (calls `logout()`). Profile open: since the renderer must not build the 97437.dev URL itself, profile opening is triggered via the main process. **Decision:** add a tiny main IPC `auth:open-profile` that calls `client.buildProfileUrl(currentUser)` + `shell.openExternal` (allowlisted) after startup validation has refreshed the user (§6.4). The preload exposes `openProfile(): Promise<void>`.

- [ ] **Step 1: Add the `openProfile` main IPC + preload method (extends 1B-8)**

In `shared/types.ts` `IPC_CHANNELS`, add `AUTH_OPEN_PROFILE: 'auth:open-profile'`. In `AuthService`, add `openProfile(): void` that, if `this.user`, calls `this.deps.openExternal(this.deps.client.buildProfileUrl(this.user))`. In `setupAuthHandlers`, add `ipcMain.handle(IPC_CHANNELS.AUTH_OPEN_PROFILE, () => authService.openProfile())`. In preload add `openProfile: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_OPEN_PROFILE)`.

- [ ] **Step 2: Write the failing test**

```tsx
// src/renderer/components/auth/UserMenu.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenu } from './UserMenu'
import { useAuthStore } from '../../stores/auth-store'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => {
  ;(window as any).electronAPI = { openProfile: vi.fn(async () => {}), logout: vi.fn(async () => {}) }
  useAuthStore.setState({ status: 'anon', user: null, device: undefined, isLoaded: true } as any)
})

describe('UserMenu', () => {
  it('shows Sign in when anonymous', () => {
    render(<UserMenu />)
    expect(screen.getByText('auth.signIn')).toBeTruthy()
  })
  it('shows the avatar + opens menu when authed, and Open profile calls main', () => {
    useAuthStore.setState({ status: 'authed', user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' } } as any)
    render(<UserMenu />)
    fireEvent.click(screen.getByLabelText('auth.signIn') ?? screen.getByText('neo'))
    fireEvent.click(screen.getByText('auth.openProfile'))
    expect((window as any).electronAPI.openProfile).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/auth/UserMenu.test.tsx`
Expected: FAIL — `./UserMenu` not found.

- [ ] **Step 4: Write minimal implementation**

```tsx
// src/renderer/components/auth/UserMenu.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth-store'
import { Avatar } from '../ui/Avatar'
import { RoleName } from '../ui/RoleName'
import { LoginModal } from './LoginModal'

export function UserMenu() {
  const { t } = useTranslation()
  const { status, user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  if (status !== 'authed' || !user) {
    return (
      <>
        <button
          onClick={() => setLoginOpen(true)}
          className="h-6 px-3 rounded-full text-xs font-display font-semibold text-ink-dim border border-[color:var(--line)] hover:text-scan hover:border-scan transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {t('auth.signIn')}
        </button>
        <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      </>
    )
  }

  return (
    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button aria-label={t('auth.signIn')} onClick={() => setMenuOpen((o) => !o)} className="flex items-center">
        <Avatar user={user} size={24} className="ring-1 ring-[color:var(--line-strong)]" />
      </button>
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-[color:var(--line)] bg-panel-2 shadow-lg p-2 z-50">
          <div className="px-2 py-1.5">
            <RoleName username={user.username} role={user.role} />
            {user.role && (
              <span className="ml-2 px-1.5 py-0.5 rounded-md text-2xs uppercase tracking-wide bg-panel text-ink-dim">{user.role}</span>
            )}
          </div>
          <button
            onClick={() => { window.electronAPI.openProfile(); setMenuOpen(false) }}
            className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-ink-dim hover:text-ink hover:bg-panel transition-colors"
          >
            {t('auth.openProfile')}
          </button>
          <button
            onClick={() => { logout(); setMenuOpen(false) }}
            className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-ink-dim hover:text-alert hover:bg-panel transition-colors"
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
```

Add `openProfile(): Promise<void>` to the preload `ElectronAPI` type usage. In `Header.tsx`, import `UserMenu` and render it inside the right-side controls, just before the status pill:

```tsx
import { UserMenu } from '../auth/UserMenu'
// ...inside the no-drag controls div, before the status pill:
<UserMenu />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/auth/UserMenu.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/auth/UserMenu.tsx src/renderer/components/layout/Header.tsx src/shared/types.ts src/main/auth/auth-service.ts src/main/ipc-handlers.ts src/preload/index.ts
git commit -m "feat(auth): header user cluster + dropdown + main-side profile open"
```

---

### Task 1C-7: Settings "Account" card (replace Appearance swatch)

**Files:**
- Modify: `src/renderer/pages/Settings.tsx` (replace the Appearance `Card` with an Account `Card`)
- Modify: `src/renderer/i18n/en.json` + `ru.json` (add `settings.account`, `settings.accountAnon`, `settings.accountAuthed`)
- Test: `src/renderer/pages/Settings.account.test.tsx`

**Interfaces:**
- Consumes: `Card`/`CardHeader`/`CardTitle`/`CardContent`, `useAuthStore`, `Avatar`, `RoleName`, `LoginModal`, `t()`.
- Produces: an Account card showing, when anon, a `auth.signIn` button (opens `LoginModal`); when authed, `Avatar` + `RoleName` + role + `auth.openProfile` + `auth.signOut`. The Appearance/palette swatch block is removed entirely (single theme; §7.5).

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/pages/Settings.account.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Settings } from './Settings'
import { useAuthStore } from '../stores/auth-store'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
beforeEach(() => {
  ;(window as any).electronAPI = { openProfile: vi.fn(), logout: vi.fn(), login: vi.fn() }
  useAuthStore.setState({ status: 'anon', user: null, isLoaded: true } as any)
})

describe('Settings Account card', () => {
  it('shows the account section and no palette swatches', () => {
    render(<Settings />)
    expect(screen.getByText('settings.account')).toBeTruthy()
    expect(screen.queryByText('#C8A47E')).toBeNull()
  })
  it('shows the username when authed', () => {
    useAuthStore.setState({ status: 'authed', user: { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: 'admin', status: 'active' } } as any)
    render(<Settings />)
    expect(screen.getByText('neo')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/pages/Settings.account.test.tsx`
Expected: FAIL — `settings.account` text absent (palette card still present).

- [ ] **Step 3: Write minimal implementation**

In `en.json` `settings` block add: `"account": "Account"`, `"accountAnon": "Sign in to show your 97437.dev identity in Custos.", "accountAuthed": "Signed in to 97437.dev"`. Add the ru equivalents: `"account": "Аккаунт"`, `"accountAnon": "Войдите, чтобы показать ваш профиль 97437.dev в Custos.", "accountAuthed": "Выполнен вход в 97437.dev"`.

Replace the `PALETTE` constant + the Appearance `Card` in `Settings.tsx` with an Account card:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useSettingsStore } from '../stores/settings-store'
import { useAuthStore } from '../stores/auth-store'
import { Avatar } from '../components/ui/Avatar'
import { RoleName } from '../components/ui/RoleName'
import { LoginModal } from '../components/auth/LoginModal'

const LANGUAGES: Array<{ id: 'en' | 'ru'; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' }
]

export function Settings() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettingsStore()
  const { status, user, logout } = useAuthStore()
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Account */}
        <Card className="mb-4">
          <CardHeader><CardTitle>{t('settings.account')}</CardTitle></CardHeader>
          <CardContent>
            {status === 'authed' && user ? (
              <div className="flex items-center gap-3">
                <Avatar user={user} size={40} />
                <div className="flex-1">
                  <RoleName username={user.username} role={user.role} />
                  <p className="text-xs text-ink-dim">{t('settings.accountAuthed')}</p>
                </div>
                <button onClick={() => window.electronAPI.openProfile()} className="text-xs text-ink-dim hover:text-scan">{t('auth.openProfile')}</button>
                <button onClick={() => logout()} className="text-xs text-ink-dim hover:text-alert">{t('auth.signOut')}</button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-dim">{t('settings.accountAnon')}</p>
                <button onClick={() => setLoginOpen(true)} className="h-9 px-4 rounded-xl text-sm font-display font-medium border border-[color:var(--line-strong)] bg-bg text-ink hover:border-scan hover:text-scan transition-colors">{t('auth.signIn')}</button>
              </div>
            )}
            <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
          </CardContent>
        </Card>

        {/* Language */}
        <Card className="mb-4">
          <CardHeader><CardTitle>{t('settings.language')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.languageDesc')}</p>
            <div className="flex gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLanguage(lang.id)}
                  aria-pressed={language === lang.id}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    language === lang.id
                      ? 'bg-scan/10 text-scan border-scan/40'
                      : 'text-ink-dim border-[color:var(--line)] hover:text-ink hover:bg-panel-2'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/pages/Settings.account.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Settings.tsx src/renderer/i18n/en.json src/renderer/i18n/ru.json src/renderer/pages/Settings.account.test.tsx
git commit -m "feat(auth): Settings Account card (replaces Appearance swatch)"
```

---

## Phase 1D (design/theme)

### Task 1D-1: Retarget palette tokens (tailwind + css) + add --on-accent

**Files:**
- Modify: `tailwind.config.js` (colors → web targets; add `on-accent`)
- Modify: `src/renderer/styles/index.css` (`:root` token values; add `--on-accent`; update `--line`/`--line-strong`/`--glow`)
- Test: `src/renderer/styles/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: token values matching spec §7.1 exactly. A test reads the two files as text and asserts the new hex values are present and the old ones are gone.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/styles/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const tw = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8')

describe('design tokens retargeted to web (spec §7.1)', () => {
  it('css :root uses the web target hexes', () => {
    expect(css).toContain('--bg:#0a0908')
    expect(css).toContain('--panel:#141110')
    expect(css).toContain('--panel-2:#1c1815')
    expect(css).toContain('--ink:#f4f0ea')
    expect(css).toContain('--scan:#c89a6a')
    expect(css).toContain('--scan-dim:#8a7b68')
    expect(css).toContain('--alert:#e0604c')
    expect(css).toContain('--amber:#e3a45c')
    expect(css).toContain('--on-accent:#14100c')
    expect(css).toContain('--glow:200,154,106')
  })
  it('css drops the old base hex', () => {
    expect(css).not.toContain('#0E0C0A')
  })
  it('tailwind maps tokens to the web targets incl on-accent', () => {
    expect(tw).toContain("'on-accent': '#14100c'")
    expect(tw).toContain("scan: '#c89a6a'")
    expect(tw).toContain("bg: '#0a0908'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/styles/tokens.test.ts`
Expected: FAIL — old hexes still present.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/styles/index.css`, replace the `:root` token block:

```css
:root {
  --bg:#0a0908; --panel:#141110; --panel-2:#1c1815;
  --ink:#f4f0ea; --ink-dim:#a89f93; --scan:#c89a6a; --scan-dim:#8a7b68;
  --alert:#e0604c; --amber:#e3a45c; --on-accent:#14100c;
  --line:rgba(244,240,234,.10); --line-strong:rgba(244,240,234,.18);
  --glow:200,154,106;
}
```

In `tailwind.config.js`, update the espresso tokens:

```js
        bg: '#0a0908',
        panel: '#141110',
        'panel-2': '#1c1815',
        ink: '#f4f0ea',
        'ink-dim': '#a89f93',
        scan: '#c89a6a',
        'scan-dim': '#8a7b68',
        alert: '#e0604c',
        amber: '#e3a45c',
        'on-accent': '#14100c',
```

(Leave the legacy `background`/`accent`/`primary`/`aurora`/`success`/`error`/`warning`/`text`/`border` maps as-is for now; 1D-3 reconciles component conventions, 1D-5 removes dead theme blocks. The `#0E0C0A` literal in `tailwind.config.js` legacy `background.DEFAULT` is updated to `#0a0908` too so the CSS test's "drops old base hex" stays focused on the CSS file — update both `background.DEFAULT` and `aurora`/`accent` blue to `#c89a6a` where they referenced the old caramel.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/styles/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js src/renderer/styles/index.css src/renderer/styles/tokens.test.ts
git commit -m "feat(design): retarget palette tokens to web values + add --on-accent"
```

---

### Task 1D-2: Font stack — keep Inter + JetBrains Mono divergences

**Files:**
- Modify: `tailwind.config.js` (confirm `fontFamily.display`/`body`/`sans`/`mono`)
- Modify: `src/renderer/styles/index.css` (`.font-mono` keeps true monospace; `body` stack)
- Test: `src/renderer/styles/fonts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: assertions that the display/body stack is `['MuseoModerno','Inter','system-ui','sans-serif']` and `mono` is `['JetBrains Mono','monospace']` (the two deliberate divergences §7.2). Mostly verification; the current config already matches, so the test locks it against regression and ensures `--on-accent`-using button text path is correct.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/styles/fonts.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const tw = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8')

describe('font divergences (spec §7.2)', () => {
  it('keeps Inter as Cyrillic fallback in the display/body stack', () => {
    expect(tw).toContain("display: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif']")
    expect(tw).toContain("body: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif']")
  })
  it('keeps JetBrains Mono as a true monospace for forensic data', () => {
    expect(tw).toContain("mono: ['JetBrains Mono', 'monospace']")
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run src/renderer/styles/fonts.test.ts`
Expected: PASS if the current config already matches; if the exact string spacing differs, the test FAILS — adjust the config strings to the exact form above, then re-run.

- [ ] **Step 3: Write minimal implementation (only if the test failed)**

Normalize `tailwind.config.js` `fontFamily` to:

```js
      fontFamily: {
        display: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
        body: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/styles/fonts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.js src/renderer/styles/fonts.test.ts
git commit -m "test(design): lock Inter + JetBrains Mono font divergences"
```

---

### Task 1D-3: Component conventions (Button primary on-accent + OAuth/secondary + Card)

**Files:**
- Modify: `src/renderer/components/ui/Button.tsx` (primary uses `text-on-accent`, `font-display font-bold`, subtle hover lift; add an `oauth` variant)
- Modify: `src/renderer/components/ui/Card.tsx` (default `rounded-xl border-line bg-panel/40 hover:border-scan/50`)
- Test: `src/renderer/components/ui/Button.test.tsx`

**Interfaces:**
- Consumes: `cn()`.
- Produces: Button `primary` = `bg-scan text-on-accent font-display font-bold hover:-translate-y-0.5 hover:shadow-glow active:opacity-80`; new `oauth` variant = `rounded-xl border border-[color:var(--line-strong)] bg-bg text-ink hover:border-scan hover:text-scan`. Card default uses `rounded-xl` + `border-[color:var(--line)]` + `bg-panel/40` + `hover:border-scan/50`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/ui/Button.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
import { Button } from './Button'

describe('Button conventions (spec §7.3)', () => {
  it('primary uses on-accent text + display bold + hover lift', () => {
    render(<Button>Go</Button>)
    const cls = screen.getByText('Go').closest('button')!.className
    expect(cls).toContain('text-on-accent')
    expect(cls).toContain('font-bold')
    expect(cls).toContain('-translate-y-0.5')
  })
  it('oauth variant uses line-strong border + bg-bg', () => {
    render(<Button variant="oauth">OAuth</Button>)
    const cls = screen.getByText('OAuth').closest('button')!.className
    expect(cls).toContain('var(--line-strong)')
    expect(cls).toContain('bg-bg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/ui/Button.test.tsx`
Expected: FAIL — primary still uses `text-bg`; no `oauth` variant.

- [ ] **Step 3: Write minimal implementation**

In `Button.tsx`, update the variant union and map:

```ts
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'oauth'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-scan text-on-accent font-display font-bold hover:-translate-y-0.5 hover:shadow-glow active:opacity-80',
  secondary: 'bg-panel text-ink border border-[color:var(--line)] hover:bg-panel-2 active:opacity-80',
  outline: 'border border-scan text-scan bg-transparent hover:bg-scan hover:text-on-accent active:opacity-80',
  danger: 'bg-alert/10 text-alert border border-alert/30 hover:bg-alert/20 active:opacity-80',
  ghost: 'text-ink-dim hover:text-ink hover:bg-panel-2 active:bg-panel',
  oauth: 'rounded-xl border border-[color:var(--line-strong)] bg-bg text-ink hover:border-scan hover:text-scan active:opacity-80'
}
```

In `Card.tsx`, change the `default` variant:

```ts
const variants = {
  default: 'bg-panel/40 backdrop-blur-xl border border-[color:var(--line)] hover:border-scan/50',
  glass: 'bg-panel/60 backdrop-blur-xl glow-scan border border-[color:var(--line)]',
  elevated: 'bg-panel-2/70 backdrop-blur-xl border border-[color:var(--line)] shadow-lg'
}
```

Also change the Card root `rounded-2xl` to `rounded-xl` to match the web Card convention.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/ui/Button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ui/Button.tsx src/renderer/components/ui/Card.tsx src/renderer/components/ui/Button.test.tsx
git commit -m "feat(design): align Button/Card conventions to web (on-accent, oauth, rounded-xl)"
```

---

### Task 1D-4: Remove theme from UserSettings + settings-store + migration

**Files:**
- Modify: `src/shared/types.ts` (`UserSettings` → `{ language: 'en'|'ru' }`)
- Modify: `src/main/ipc-handlers.ts` (`UserSettingsSchema` drops `theme`; add migration that strips a legacy `theme` key)
- Modify: `src/main/services/app-store.ts` (default `settings` is `{ language: 'en' }`)
- Modify: `src/renderer/stores/settings-store.ts` (drop `theme`/`ThemeName`/`setTheme`; set `<html data-theme="dark">` statically)
- Test: `src/main/auth/settings-migration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `UserSettings = { language: 'en' | 'ru' }`.
  - `migrateSettings(raw: unknown): { language: 'en' | 'ru' }` — strips an unknown legacy `theme` key and any other extras, returns a valid settings object (default `language: 'en'`). Used by `SETTINGS_GET` so an existing persisted `{ language, theme }` doesn't trip the `.strict()` partial schema on the next `SETTINGS_SET`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/auth/settings-migration.test.ts
import { describe, it, expect } from 'vitest'
import { migrateSettings } from '../ipc-handlers'

describe('migrateSettings (drops legacy theme)', () => {
  it('strips a legacy theme key', () => {
    expect(migrateSettings({ language: 'ru', theme: 'tropical' })).toEqual({ language: 'ru' })
  })
  it('defaults language to en for junk', () => {
    expect(migrateSettings({ theme: 'aurora' })).toEqual({ language: 'en' })
    expect(migrateSettings(null)).toEqual({ language: 'en' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/auth/settings-migration.test.ts`
Expected: FAIL — `migrateSettings` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/shared/types.ts`:

```ts
export interface UserSettings {
  language: 'en' | 'ru'
}
```

In `src/main/ipc-handlers.ts`, replace the two settings schemas and add the migration:

```ts
const UserSettingsPartialSchema = z.object({
  language: z.enum(['en', 'ru']).optional()
}).strict()

const UserSettingsSchema = z.object({
  language: z.enum(['en', 'ru']).default('en')
})

/** Normalize persisted settings: drop the legacy `theme` key (and any extras). */
export function migrateSettings(raw: unknown): UserSettings {
  const language = (raw && typeof raw === 'object' && (raw as any).language === 'ru') ? 'ru' : 'en'
  return { language }
}
```

In the `SETTINGS_GET` handler, run the migration before validation:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): UserSettings => {
    const migrated = migrateSettings(appStore.get('settings'))
    appStore.set('settings', migrated)
    return migrated
  })
```

In `src/main/services/app-store.ts`, the default `settings` becomes `{ language: 'en' }` (already done in 1B-3's example).

In `src/renderer/stores/settings-store.ts`, remove `ThemeName`, `theme`, `setTheme`, and all `data-theme` writes; set the static theme once at module load:

```ts
import { create } from 'zustand'
import i18n from '../i18n'

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null

interface SettingsState {
  language: 'en' | 'ru'
  isLoading: boolean
  version: string
  setLanguage: (value: 'en' | 'ru') => void
  setVersion: (version: string) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: 'en',
  isLoading: true,
  version: '',

  setLanguage: (value) => {
    set({ language: value })
    i18n.changeLanguage(value)
    get().saveSettings()
  },

  setVersion: (version) => set({ version }),

  loadSettings: async () => {
    try {
      const settings = await window.electronAPI.getSettings()
      const version = await window.electronAPI.getVersion()
      const language = settings.language === 'ru' ? 'ru' : 'en'
      i18n.changeLanguage(language)
      set({ language, version, isLoading: false })
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ isLoading: false })
    }
  },

  saveSettings: async () => {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer)
    saveDebounceTimer = setTimeout(async () => {
      saveDebounceTimer = null
      try {
        await window.electronAPI.setSettings({ language: get().language })
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    }, 100)
  }
}))
```

In `src/renderer/index.html`, set `<html lang="en" data-theme="dark">`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/auth/settings-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (catches lingering `theme` references)**

Run: `npm run typecheck`
Expected: PASS. If any component referenced `settings.theme`/`setTheme`/`ThemeName`, fix it (the only known consumers are `settings-store.ts`, `Settings.tsx` (already rewritten in 1C-7), and the dead `main/index.ts` block handled in 1D-5).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc-handlers.ts src/main/services/app-store.ts src/renderer/stores/settings-store.ts src/renderer/index.html src/main/auth/settings-migration.test.ts
git commit -m "feat(design): drop theme from settings + add legacy-theme migration"
```

---

### Task 1D-5: Remove dead `[data-theme]` CSS blocks + repoint main backgroundColor

**Files:**
- Modify: `src/renderer/styles/index.css` (collapse the `:root,[data-theme=…]` block to a single `:root`; the legacy `--theme-*` vars can stay but are no longer theme-switched)
- Modify: `src/main/index.ts` (replace the `themeColors`/`savedTheme`/`bgColor` block with `const bgColor = '#0a0908'`)
- Test: `src/renderer/styles/dead-theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: assertions that no `[data-theme="aurora"|"mono"|"tropical"]` selector remains in the CSS and that `main/index.ts` no longer references `themeColors`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/styles/dead-theme.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const mainIdx = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('dead themes removed (spec §7.5)', () => {
  it('css has no data-theme selectors for the three dead themes', () => {
    expect(css).not.toContain('[data-theme="aurora"]')
    expect(css).not.toContain('[data-theme="mono"]')
    expect(css).not.toContain('[data-theme="tropical"]')
  })
  it('main no longer reads a saved theme for backgroundColor', () => {
    expect(mainIdx).not.toContain('themeColors')
    expect(mainIdx).toContain("'#0a0908'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/styles/dead-theme.test.ts`
Expected: FAIL — selectors + `themeColors` still present.

- [ ] **Step 3: Write minimal implementation**

In `index.css`, change the legacy block selector from:

```css
:root,
[data-theme="aurora"],
[data-theme="mono"],
[data-theme="tropical"] {
```

to a single:

```css
:root {
```

(keep the `--theme-*` variable definitions inside; they're still referenced by `.theme-*` classes).

In `src/main/index.ts`, replace the top block:

```ts
// Single canonical dark theme — background matches the --bg design token.
const bgColor = '#0a0908'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/styles/dead-theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck + build sanity**

Run: `npm run test && npm run typecheck`
Expected: PASS (all unit tests green; no type errors).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/index.css src/main/index.ts src/renderer/styles/dead-theme.test.ts
git commit -m "feat(design): remove dead [data-theme] blocks + repoint main backgroundColor"
```

---

## Phase 1E (manual Windows verification)

### Task 1E-1: Manual Windows verification + merge gate checklist

**Files:**
- Create: `docs/superpowers/plans/1E-windows-verification-checklist.md` (a tracked checklist; this is the one doc file this plan creates, because it is the manual sign-off artifact for §11/§13)

**Interfaces:**
- Consumes: a real Windows install + a running custosweb (local dev backend first via `WEB_BASE_URL=http://localhost:3000`, then a staging/production-like Railway environment).
- Produces: a completed checklist proving §11 passes and the §13 merge gate is satisfied. **No unit tests** — this task is manual and gates the PR; do NOT merge on unit-test green alone (§10/§13).

- [ ] **Step 1: Build a Windows package against the LOCAL dev backend**

Set `WEB_BASE_URL=http://localhost:3000` (or the bundled `resources/settings.json` `auth.webBaseUrl`), start the local custosweb (Phase 1A) dev server, then build: `npm run package:win`. Install on a real Windows machine.

- [ ] **Step 2: Walk the §11 checklist (local backend)** — check each box:

```markdown
## §11 Manual Windows verification (local custosweb)
- [ ] custos:// protocol registration works (clicking a custos://auth/callback?... link routes to the app via second-instance).
- [ ] Primary browser auto-return signs the app in (Google AND GitHub).
- [ ] Device-code fallback works when the custos:// return is blocked (shows user_code, opens /device, polls to authed; honors interval/slow_down; stops on denied/expired).
- [ ] safeStorage token persists across an app restart (still signed in).
- [ ] Fail-closed path: on a box where safeStorage.isEncryptionAvailable() is false, the token is NOT written to disk and the encryption-unavailable copy (§9) is shown; re-login required after restart.
- [ ] Logout wipes the local token immediately (verify electron-store `auth.tokenEnc` is gone) and best-effort server revoke fires.
- [ ] Banned/deleted account → next startup validation silently wipes to anonymous (no error nag).
- [ ] Scanner works fully with NO login and NO internet (PR-1): run a full scan, view results, export.
- [ ] Kill switch: with DESKTOP_AUTH_ENABLED=false, no auth UI is shown and the scanner is unaffected (PR-2).
- [ ] Renderer never receives a token: confirm via DevTools that auth:get-state / auth:changed payloads contain only {status, public user, device} — no token/grant/code_verifier.
- [ ] openExternal only ever opens https://<webBase>/desktop/auth/start, /device, or /profile/id/<id> — no arbitrary URLs.
```

- [ ] **Step 3: Re-run §11 against a production-like Railway environment**

Repeat Step 2 with the production/staging `WEB_BASE_URL` (https://97437.dev or a staging origin). Confirm the deploy checklist: `DESKTOP_GRANT_SECRET` set on Railway, custosweb redeployed, protocol registration confirmed on a clean install, no Google/GitHub console change needed.

- [ ] **Step 4: Run the §13 merge gate in BOTH repos**

```markdown
## §13 Merge gate (both repos)
- [ ] custos: npm run typecheck — PASS
- [ ] custos: npm run lint — PASS
- [ ] custos: npm run build — PASS
- [ ] custos: npm run test — PASS
- [ ] custosweb: typecheck / lint / build / test — PASS
- [ ] Manual login flow verified local → production-like (Steps 2–3) — PASS
- [ ] PR opened per repo; changed files reviewed; NOT a direct merge to main after a huge diff.
```

- [ ] **Step 5: Commit the completed checklist**

```bash
git add docs/superpowers/plans/1E-windows-verification-checklist.md
git commit -m "docs(auth): completed §11 Windows verification + §13 merge gate"
```

---

## Self-review: spec coverage

| Spec section | Requirement | Task(s) |
|---|---|---|
| §4.1 / §4.2 | Primary browser→`custos://` flow, explicit provider | 1B-1, 1B-4, 1B-7, 1B-8 |
| §4.3 | PKCE S256 challenge from verifier (client side) | 1B-1, 1B-4 (exchange sends `code_verifier`) |
| §4.4 | Device-code fallback, bounded polling (interval/slow_down/max/denied/expired) | 1B-4 (`pollDeviceToken`), 1B-7 (`runDeviceFlow`/`pollDevice`), 1C-5 (panel) |
| §4.5 | Long-lived token, startup validation = source of truth, ban/delete silent wipe | 1B-4 (`getSession` null on 401/banned/deleted), 1B-7 (`validateOnStartup`) |
| §4.6 | Strict `custos://` parsing + rejection + clear pending | 1B-6 (`parseCallback`), 1B-7 (`handleCallback`) |
| §4.7 | Fail-closed safeStorage, no plaintext to disk | 1B-3 (`TokenStore`), 1C-5/§9 copy |
| §4.8 | Renderer never sees token-like material | Global Constraints, 1B-7 (`AuthState`), 1B-8 (IPC), 1C-1 (store) |
| §4.9 | Pending-state cleared on every terminal outcome | 1B-7 (`clearPending` in all paths) |
| §4.10 | Logout local-wipe first, best-effort revoke | 1B-7 (`logout`), 1B-4 (`revoke` never throws) |
| §4.12 | Non-sensitive logging / redaction | 1B-4 (`redact`), Global Constraints |
| §4.13 | Kill switch `DESKTOP_AUTH_ENABLED` | 1B-2, 1B-7 (login/validate no-op when disabled), 1E |
| §6.1 | AuthService, protocol reg, single-instance, openExternal allowlist, IPC, persistence | 1B-2..1B-8 |
| §6.2 | Preload bridge + global.d.ts | 1B-8 |
| §6.3 | auth-store, login modal+device, header menu, avatar, role badge, Settings card, no gate | 1C-1..1C-7 |
| §6.4 | Stable id-based profile URL (not stale) | 1B-4 (`buildProfileUrl` = `/profile/id/<id>`), 1C-6 (open after startup refresh, opened from main) |
| §6.5 | Avatar safe load, initials fallback, no token in URL | 1C-2 |
| §7.1 | Token retarget + `--on-accent` (tailwind + css) | 1D-1 |
| §7.2 | Keep Inter + JetBrains Mono divergences | 1D-2 |
| §7.3 | Button/Card/OAuth/eyebrow/pill conventions | 1D-3, 1C-5 (oauth button), 1C-6 (pill/badge) |
| §7.5 | Full dead-theme removal + migration + static `data-theme="dark"` + main bg | 1D-4, 1D-5 |
| §9 | Specific error copy (en + ru) | 1C-4, surfaced in 1C-5/1C-6/1C-7 |
| §10 | Desktop tests (PKCE, parsing+rejection, exchange, safeStorage+fail-closed, pending, device loop, url-policy, avatar fallback, kill switch) | 1B-1,1B-3,1B-4,1B-5,1B-6,1B-7,1B-8,1C-1,1C-2,1C-5 |
| §11 | Manual Windows verification | 1E-1 |
| §13 | Merge gate (typecheck/lint/build/test both repos, local→prod) | 1E-1 |
| PR-1 | Login optional; scanner works offline/no account | Global Constraints, 1C-1 (no gate), 1E (checklist) |
| PR-2 | Kill switch hides auth UI, scanner unaffected | 1B-2, 1B-7, 1E |
| PR-3 | No report sharing in Phase 1 | Scope (no upload task exists) |
