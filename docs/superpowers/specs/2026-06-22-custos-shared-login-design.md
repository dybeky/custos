# Custos ⇄ 97437.dev — Shared Login + Identity + Design Alignment

**Status:** Approved design (Phase 1)
**Date:** 2026-06-22
**Repos touched:** `custos` (Electron desktop scanner) and `custosweb` (Next.js site, `97437.dev`)
**Author/driver:** dybeky

---

## 1. Context & goals

`custos` is a Windows forensic anti-cheat scanner (Electron 42 + React 19 + Vite + Tailwind 3
+ zustand + react-router HashRouter + electron-store + i18next). It ships no auth today.

`custosweb` is the marketing + community site at `https://97437.dev` (Next.js 16 + React 19
+ Tailwind v4 + **Better Auth** social login (Google + GitHub) + Postgres/Drizzle). Auth today
is **same-origin cookie sessions only** — no `trustedOrigins`, no bearer/token support.

**Goal:** let a user sign into the desktop app with their existing `97437.dev` account, show
their identity/profile inside the app, and align the desktop app's visual design with the web
product — without breaking the scanner, which must keep working with no account at all.

This spec covers **Phase 1 only**. Sharing scan reports to the web is **Phase 2** (separate spec).

### Locked product decisions

1. **Login is optional.** The scanner works fully offline / with no account, exactly as today.
2. **Gated features:** identity/profile (Phase 1) and share-scan-reports-to-web (Phase 2).
3. **Primary login flow:** system browser → OAuth on `97437.dev` → auto-return to the app via a
   `custos://` deep link, exchanged for a bearer token.
4. **Fallback login flow:** device-code (RFC 8628 style) when the `custos://` return is blocked,
   unavailable, or times out — important because custos's audience runs hardened/AV-locked Windows.
5. **Design:** exact, tool-appropriate match to `97437.dev` (palette, type, components, login modal,
   avatar, user menu, role badges). **No** marketing-site motion layer (smooth-scroll/WebGL). One
   canonical coffee-noir theme; the three dead identical themes are removed.

---

## 2. Scope

**In scope (Phase 1):**

- Web: enable bearer/token auth for a desktop client; desktop OAuth handoff routes; signed grant
  exchange; device-code fallback; `trustedOrigins`.
- Desktop: main-process `AuthService` (browser OAuth + `custos://` handler + device-code fallback +
  `safeStorage` token store), IPC bridge, renderer `auth-store`, login modal, header user menu,
  avatar + role badge, Settings "Account" card.
- Design alignment: token values, fonts, component conventions, removal of dead themes.

**Out of scope (→ Phase 2 / future):**

- Sharing scan reports to the web (ingest endpoint, storage, web report-view page, desktop "Share"
  action on `Results`).
- Settings sync across devices; gating Live/advanced scans behind a role.
- Strict single-use (replay-proof) grants — see §4.3; deferred to a DB-backed `jti` store.
- Any change to Google/GitHub developer-console OAuth apps (the existing web OAuth callback URL is
  reused unchanged).

---

## 3. Architecture overview

The desktop **renderer never performs auth networking and never sees the token.** All auth HTTP
happens in the Electron **main process**, so the renderer's locked-down CSP (`connect-src 'self'
https://api.github.com`) is untouched.

```
┌─ custos (Electron) ──────────────────┐        ┌─ custosweb (97437.dev) ─────────────────┐
│ renderer                             │  IPC   │ Better Auth + bearer plugin             │
│   login modal · avatar · user menu   │◄─────► │ GET  /desktop/auth/start  (kick OAuth)  │
│   auth-store (public state only)     │        │ GET  /desktop/complete    (mint grant)  │
│ main                                 │ HTTPS  │ POST /api/desktop/token/exchange        │
│   AuthService                        │◄─────► │ GET  /device + device-auth plugin (fb)  │
│     · system-browser OAuth           │        │ (existing OAuth callback URL UNCHANGED) │
│     · custos:// callback handler     │        └─────────────────────────────────────────┘
│     · device-code fallback           │
│     · safeStorage token (main only)  │
└──────────────────────────────────────┘
```

---

## 4. Auth flows

### 4.1 Primary — browser → auto-return via `custos://`

1. **Desktop** generates `state` (random), PKCE `code_verifier` + `code_challenge` (S256), and a
   `pendingAuth` record. Opens the **system browser** (`shell.openExternal`) to
   `https://97437.dev/desktop/auth/start?state=<state>&cc=<code_challenge>&provider=<google|github>`.
2. `/desktop/auth/start` begins the **normal** Better Auth social sign-in (so the existing OAuth
   callback URL is reused — **no Google/GitHub console change**), carrying `state`/`cc` through to
   the post-login landing.
3. On success the browser lands on **`/desktop/complete`**, which — with the just-established
   session — mints a **short-lived signed grant** (§4.3) and redirects to
   `custos://auth/callback?state=<state>&code=<grant>`.
4. **Desktop** catches the `custos://` deep link (single-instance lock + argv parsing on Windows),
   **strictly validates the shape** (§4.6), confirms `state` matches `pendingAuth`, then calls
   `POST https://97437.dev/api/desktop/token/exchange` with `{ state, code, code_verifier }` over
   HTTPS.
5. The server verifies the grant signature, TTL, `stateHash`, and `codeChallenge` against the
   supplied `code_verifier`, then returns `{ token, user }`. The bearer **token never appears in the
   `custos://` URL** — it only travels inside the HTTPS exchange response.
6. Desktop encrypts the token with `safeStorage` (§4.7), caches the public user, emits
   `auth:changed`, clears `pendingAuth`.

### 4.2 Provider/mode selection

`auth:login` carries an explicit `{ provider: 'google' | 'github' | 'device', }` payload so Google,
GitHub, and device-code starts are distinct, testable code paths (not inferred). The login modal
sends the chosen provider; the "Use a sign-in code instead" affordance sends `mode: 'device'`.

### 4.3 The signed grant (v1)

The grant returned by `/desktop/complete` is a token signed (HMAC) with a **dedicated secret**
(`DESKTOP_GRANT_SECRET`, distinct from `BETTER_AUTH_SECRET`/`KEEP_ACCOUNT_SECRET`). Claims:

| Claim | Purpose |
|---|---|
| `userId` | who the grant is for |
| `stateHash` | hash of the desktop-supplied `state` (binds grant to this login attempt) |
| `codeChallenge` | PKCE S256 challenge (binds grant to the desktop instance holding the verifier) |
| `iat` / `exp` | issued-at / expiry — **short TTL (~120s)** |
| `jti` | unique id (reserved for a future replay store) |

**v1 security properties (documented honestly):** short-lived, state-bound, PKCE-bound,
tamper-resistant. **NOT strict single-use** — within its ~120s TTL a grant could in principle be
replayed, because v1 keeps **no server-side `jti` store**. This is an accepted, time-boxed risk.

**Upgrade path:** add a DB-backed `desktop_grant` / `jti` table (or short-TTL KV) and reject any
`jti` already seen → strict single-use. The `jti` claim exists now precisely so this upgrade needs
no client change.

### 4.4 Fallback — device code

Triggered when the `custos://` return is unavailable/blocked, or the primary callback does not
arrive within ~90s, or the user clicks "Use a sign-in code instead."

1. Desktop requests a device code (Better Auth **device-authorization plugin** if present in
   `better-auth@1.6.12`, else a minimal equivalent endpoint pair).
2. Desktop shows the `user_code` and opens the system browser to `https://97437.dev/device`.
3. User signs in (if needed) and approves the code.
4. Desktop polls the token endpoint at the prescribed interval until it receives the bearer token,
   then proceeds as in 4.1 step 6.

Device-code IPC/state is explicit enough for the modal to render progress: statuses
`requesting → awaiting-approval (with user_code + verification_uri) → polling → authed | denied |
expired | error`.

### 4.5 Token model, scope & session validation

- The desktop credential is a **dedicated token tagged as a desktop client** — **not** a full
  web-session credential. Server-side it is authorized only for **identity + report-sharing** scopes;
  web-only privileged actions (moderation, profile mutation, messaging, etc.) **reject desktop
  tokens.** Exact mechanism (session row tagged `client:'desktop'` vs JWT/api-key scope claim) is an
  implementation choice deferred to the plan; the **scope-limiting requirement is binding.**
- **Cached user is display-only.** The source of truth on every startup is a live
  `GET /api/auth/get-session` with the bearer. On 401, or `status` `banned`/`deleted`, the app
  **silently signs out** (clears token, emits `auth:changed`). The cached user only avoids a
  logged-out flash while validation is in flight.
- Banned/deleted handling reuses the web's existing session hooks — no parallel moderation logic.

### 4.6 Callback hardening

The `custos://` handler accepts **only** `custos://auth/callback` with **both** `state` and `code`
present and well-formed. Any other host/path, missing/garbage params, or a `state` not matching the
current `pendingAuth` is **rejected and logged**, never acted on.

### 4.7 Secret storage — fail closed

- The bearer token is stored only in the **main process**, encrypted via Electron `safeStorage`,
  persisted as base64 in electron-store under the `auth` key. Decrypted in main only; the renderer
  never receives it.
- **If `safeStorage.isEncryptionAvailable()` is false / weak, fail closed:** do **not** persist a
  plaintext token. Either keep the session in-memory only for the current run or require re-login on
  next launch — never write a plaintext credential to disk.

### 4.8 Pending-state lifecycle

`pendingAuth { state, codeVerifier, codeChallenge, provider, startedAt, timer }` is **always cleared**
on every terminal outcome: **success, timeout (~90s → offer device code), user cancel, and failure.**
No orphaned timers or deep-link listeners.

### 4.9 Logout

Logout **deletes the local `safeStorage` token** and **revokes the desktop token server-side** if
supported (`/api/auth/sign-out` with the bearer, or a desktop-token revoke endpoint), then clears the
cached user and emits `auth:changed`. Local cleanup proceeds even if the server revoke call fails
(best-effort revoke, guaranteed local wipe).

---

## 5. Web-side changes (`custosweb`)

You redeploy once on Railway after these land. No Google/GitHub console changes.

- **Better Auth config (`lib/auth.ts`):** add the **`bearer` plugin**; add **`trustedOrigins`** to
  permit the desktop handoff/exchange; ensure desktop tokens are scoped (§4.5).
- **New routes:**
  - `GET /desktop/auth/start` — validates `state`/`cc`/`provider`, kicks off social sign-in carrying
    them through to the landing.
  - `GET /desktop/complete` — requires a live session; mints the signed grant (§4.3); redirects to
    `custos://auth/callback?...`. Renders a minimal "Return to Custos" page (no session ⇒ bounce to
    login).
  - `POST /api/desktop/token/exchange` — verifies grant (sig, TTL, `stateHash`, PKCE
    `codeChallenge` vs `code_verifier`); returns `{ token, user }`.
  - `GET /device` approval page + device-authorization plugin endpoints (fallback).
- **Env:** add `DESKTOP_GRANT_SECRET` (own secret; `openssl rand -base64 32`). Document in
  `.env.example` and `STATUS.md`.
- **Respect existing posture:** strict same-origin headers / per-request CSP nonce in `proxy.ts` are
  for the web page and are unaffected; the desktop is a native client, not a browser origin.

> Heed `custosweb/AGENTS.md`: this is a **modified Next.js 16** ("`proxy.ts` replaces
> `middleware.ts`"); read `node_modules/next/dist/docs/` before coding. Do **not** add `better-auth`
> to `serverExternalPackages` (breaks `useSession`). Keep `kysely@0.28.17` pinned.

---

## 6. Desktop-side changes (`custos`)

### 6.1 Main process

- **`src/main/services/auth-service.ts`** — owns the full flow: state/PKCE generation, system-browser
  open, `custos://` handler (strict validation §4.6), grant exchange, device-code fallback,
  `safeStorage` token persistence (fail-closed §4.7), startup validation, logout/revoke, pending-state
  lifecycle (§4.8).
- **Protocol registration** — `app.setAsDefaultProtocolClient('custos')`; `requestSingleInstanceLock`
  + `second-instance` argv parsing (Windows) and `open-url` (mac, for dev parity).
- **`openExternal` allowlist** — extend `src/main/utils/url-policy.ts` so the auth flow's outbound
  opens are explicitly allowed for `https://97437.dev/...` (it is already `https`-allowed generally;
  the spec requires it be an explicit, tested allowlist entry, not incidental). `custos://` is
  **inbound** and never goes through `openExternal`.
- **IPC (`src/main/ipc-handlers.ts`, zod-validated like existing channels):**
  - `auth:get-state` → `{ status:'anon'|'authed'|'pending', user|null, device?: DeviceProgress }`
  - `auth:login` ← `{ provider:'google'|'github'|'device' }` — starts the chosen flow
  - `auth:cancel` — cancels the pending flow, clears state
  - `auth:logout`
  - push event `auth:changed` (and device-progress updates surfaced via `auth:get-state` / a
    `auth:device` push so the modal can render progress)
- **Persistence (`src/main/services/app-store.ts`):** add an `auth` key `{ tokenEnc?: string,
  user?: CachedUser }` alongside `settings`. Renderer receives only `user` (public fields).

### 6.2 Preload (`src/preload/index.ts`)

Add `getAuthState`, `login(provider)`, `cancelLogin`, `logout`, `onAuthChanged(cb)` (and device
progress subscription) to the `electronAPI` bridge. Update `src/shared/global.d.ts` /
`shared/types.ts` accordingly.

### 6.3 Renderer

- **`src/renderer/stores/auth-store.ts`** — mirrors `settings-store`: hydrate via `getAuthState()` on
  boot, subscribe to `onAuthChanged`, hold `{ status, user, device }` with public user fields only
  (`id, username, uid, avatarVersion, role, status`).
- **Login modal** (reuse `Modal.tsx`): "Continue with Google" / "Continue with GitHub" buttons styled
  like the web OAuth button (`IconGoogle`/`IconGithub` + `rounded-xl border border-line-strong bg-bg
  hover:border-scan hover:text-scan`). A quiet **"Use a sign-in code instead"** reveals the
  device-code panel (`user_code`, opens `/device`, live status from §4.4).
- **Header user cluster** (`components/layout/Header.tsx`, right of the OS pill): **"Sign in"** when
  anon; **avatar + dropdown** (`UserMenu`) when authed — username with role glow, role badge, "Open
  profile on web" (`openExternal` → `97437.dev/u/<username>`), "Sign out".
- **Settings** (`pages/Settings.tsx`): replace the read-only "Appearance" palette swatch with an
  **"Account"** card (sign-in / profile summary / sign-out).
- **New UI primitives:** `components/ui/Avatar.tsx` (image with initials fallback + role ring) and
  `components/ui/RoleName.tsx` (role-colored, matching the web's `.role-glow`). No text-input
  primitive needed — login is social-only.
- **No blocking auth gate.** Login is optional; auth UI lives in the header + Settings. Phase-2 gated
  actions will check `auth-store`.

---

## 7. Design alignment

### 7.1 Tokens (update `tailwind.config.js` **and** `src/renderer/styles/index.css :root`)

| Token | Desktop (now) | → Web target |
|---|---|---|
| `--bg` | `#0E0C0A` | `#0a0908` |
| `--panel` | `#171411` | `#141110` |
| `--panel-2` | `#1F1B16` | `#1c1815` |
| `--ink` | `#EDE7DE` | `#f4f0ea` |
| `--ink-dim` | `#A89F93` | `#a89f93` |
| `--scan` | `#C8A47E` | `#c89a6a` |
| `--scan-dim` | `#B0A696` | `#8a7b68` |
| `--alert` | `#D98E8E` | `#e0604c` |
| `--amber` | `#D9B380` | `#e3a45c` |
| `--on-accent` | *(missing)* | `#14100c` **(add)** |
| `--line` | ad-hoc | `rgba(244,240,234,0.10)` |
| `--line-strong` | ad-hoc | `rgba(244,240,234,0.18)` |
| `--glow` | — | `200,154,106` (rgb triplet) |

### 7.2 Fonts — two deliberate, justified divergences from the web

- **MuseoModerno** stays the single brand display/body face (already shipped in
  `src/renderer/assets/fonts/`).
- **Divergence 1 — keep Inter as the Cyrillic fallback.** The desktop app has `ru` i18n; the web
  does not need this. Font stack: `['MuseoModerno','Inter','system-ui','sans-serif']`.
- **Divergence 2 — keep a true monospace for forensic data.** The web aliases `font-mono` →
  MuseoModerno (brand mono). The desktop scanner prints **file hashes, registry paths, and tabular
  forensic output** where real monospace readability matters, so it keeps **JetBrains Mono** for that
  data. The web's eyebrow/label convention (uppercase, tracked) is adopted for UI labels using the
  brand face.

### 7.3 Components

Align to the web's conventions:

- **Button primary:** caramel fill, `text-on-accent`, `font-display font-bold`, subtle
  `hover:-translate-y-0.5`.
- **OAuth/secondary button:** `rounded-xl border border-line-strong bg-bg hover:border-scan
  hover:text-scan`.
- **Card:** `rounded-xl border border-line bg-panel/40 hover:border-scan/50` + glass/elevated variant
  (`bg-panel/80 backdrop-blur` + `.glow-scan`).
- Add web-matching **eyebrow** (uppercase, tracked, `text-ink-dim`), **pill/badge**
  (`rounded-full border-scan/40 bg-scan/10 text-scan`), and **dropdown** conventions.
- Reconcile `.glow-scan` / `.text-glow` with the web definitions.

### 7.4 Remove dead themes

`aurora` / `mono` / `tropical` are three identical no-op `data-theme` values. Collapse to **one
canonical theme**:

- Drop the duplicate `[data-theme="…"]` blocks in `styles/index.css`; keep a single `:root`.
- Set `<html data-theme="dark">` statically (matches the web).
- Remove the theme field/selector from `settings-store` and Settings UI.
- Point the main-process `backgroundColor` (read in `src/main/index.ts` before window creation) at the
  new `--bg`.
- Add a **one-line migration** so an existing persisted `settings.theme` value does not trip the
  `.strict()` zod schema on upgrade (strip/normalize the legacy key in `app-store`).

---

## 8. Persistence & secrets summary

- **electron-store** gains an `auth` key `{ tokenEnc?: safeStorage-base64, user?: CachedUser }`,
  separate from `settings`. Token decrypted in main only; renderer gets `user` only.
- **Web env:** `DESKTOP_GRANT_SECRET` (new, dedicated). Existing `BETTER_AUTH_URL`/secrets unchanged.
- Fail-closed on weak/absent `safeStorage` (§4.7).

---

## 9. Testing (vitest, both repos)

**Desktop:**
- state + PKCE (S256) generation.
- `custos://` callback parsing **including rejection** of wrong host/path, missing `state`/`code`,
  mismatched `state`.
- grant exchange (happy path + server-error path).
- `safeStorage` round-trip (mocked) **and** fail-closed behavior when encryption unavailable.
- pending-state cleared on success / timeout / cancel / failure.
- device-code poll loop (awaiting → authed / denied / expired).
- `url-policy` allowlist includes `https://97437.dev/...`.

**Web:**
- grant sign/verify: claim set, TTL expiry, `stateHash` binding, PKCE `codeChallenge` vs
  `code_verifier`, tamper rejection. (Replay-within-TTL is **documented as accepted** for v1, not
  tested as prevented.)
- `POST /api/desktop/token/exchange` happy + invalid-grant paths.
- bearer-plugin scope gate: a desktop token **cannot** hit web-only privileged actions.
- `/desktop/complete` requires a live session (no session ⇒ bounce to login).

**Manual:** full round-trip against a **local `custosweb` dev backend** first, then production.

---

## 10. Manual setup checklist (for the human)

- [ ] Generate `DESKTOP_GRANT_SECRET`, add to Railway env for `custosweb`.
- [ ] Redeploy `custosweb` (web + worker as usual).
- [ ] Verify `custos://` protocol registers on a real Windows install (installer/admin manifest).
- [ ] No Google/GitHub console changes required (existing web callback reused).

---

## 11. Phase 2 (separate spec — not built here)

Share scan reports to the web, built on Phase 1's bearer token: web ingest endpoint + storage +
web report-view page + a "Share" action on the desktop `Results` page (scope-gated to desktop tokens).

---

## 12. Open items / future upgrades

- **Strict single-use grants:** add DB-backed `jti` store → reject replays (`jti` claim already
  present).
- **Token refresh/expiry UX:** decide silent re-auth vs prompt when the desktop token expires.
- **Device-flow plugin availability:** confirm `better-auth@1.6.12` ships device-authorization; if
  not, implement the minimal endpoint pair.
