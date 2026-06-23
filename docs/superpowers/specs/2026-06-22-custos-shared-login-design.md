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

This spec covers **Phase 1 only**. Sharing scan reports to the web is **Phase 2** (separate spec, §14).

### Product rules (non-negotiable)

- **PR-1 — Login is optional.** Local scan, local results, local export, and basic settings must work
  with **no account and no internet**. Login never gates the scanner.
- **PR-2 — Kill switch.** A feature flag `DESKTOP_AUTH_ENABLED` (default may be on, but flippable to
  `false`) disables desktop login end-to-end if production auth breaks. With it off, the scanner runs
  fully anonymously and no auth UI is shown (§4.13).
- **PR-3 — Phase 1 ≠ report sharing.** Phase 1 is login + identity + profile display + visual
  alignment only. Report upload/sharing is Phase 2 (it adds storage, privacy, report schema, public
  links, abuse controls, and deletion policy — §14).

### Locked product decisions

1. Login is **optional**; scanner unaffected (PR-1).
2. Gated features: identity/profile (Phase 1) and share-scan-reports-to-web (Phase 2).
3. **Primary login flow:** system browser → OAuth on `97437.dev` → auto-return via a `custos://` deep
   link, exchanged (over HTTPS) for a bearer token.
4. **Fallback login flow:** device-code when the `custos://` return is blocked/unavailable/times out —
   custos's audience runs hardened/AV-locked Windows.
5. **Design:** exact, tool-appropriate match to `97437.dev`. **No** marketing motion (smooth-scroll/
   WebGL). One canonical coffee-noir theme; the three dead identical themes removed fully.

---

## 2. Scope

**In scope (Phase 1):** web token/bearer auth for a desktop client; desktop OAuth handoff routes;
signed grant exchange; device-code fallback; `trustedOrigins`; rate limits + audit logging + kill
switch on the web; desktop main-process `AuthService` (browser OAuth + `custos://` handler +
device-code + `safeStorage` token store); IPC bridge; renderer `auth-store`; login modal; header user
menu; avatar + role badge; Settings "Account" card; design alignment + dead-theme removal.

**Out of scope (→ Phase 2 / future):** report sharing (§14); settings sync; gating Live/advanced scans
behind a role; **strict single-use (replay-proof) grants** (§4.3 — deferred to a DB/KV `jti` store);
any Google/GitHub developer-console change (the existing web OAuth callback URL is reused unchanged).

---

## 3. Architecture overview

The desktop **renderer performs no auth networking and never sees token-like material.** All auth HTTP
happens in the Electron **main process**, so the renderer's locked-down CSP (`connect-src 'self'
https://api.github.com`) is untouched.

```
┌─ custos (Electron) ──────────────────┐        ┌─ custosweb (97437.dev) ─────────────────┐
│ renderer                             │  IPC   │ Better Auth + bearer plugin (scoped)    │
│   login modal · avatar · user menu   │◄─────► │ GET  /desktop/auth/start  (kick OAuth)  │
│   auth-store (status + public user)  │        │ GET  /desktop/complete    (mint grant)  │
│ main                                 │ HTTPS  │ POST /api/desktop/token/exchange        │
│   AuthService                        │◄─────► │ GET  /device + device-auth (fallback)   │
│     · system-browser OAuth           │        │ rate limits · audit log · kill switch   │
│     · custos:// callback handler     │        │ (existing OAuth callback URL UNCHANGED) │
│     · device-code fallback           │        └─────────────────────────────────────────┘
│     · safeStorage token (main only)  │
└──────────────────────────────────────┘
```

---

## 4. Auth flows

### 4.1 Primary — browser → auto-return via `custos://`

1. **Desktop** generates `state` (random), PKCE `code_verifier` + `code_challenge` (S256), and a
   `pendingAuth` record. Opens the **system browser** to
   `https://97437.dev/desktop/auth/start?state=<state>&cc=<code_challenge>&provider=<google|github>`.
2. `/desktop/auth/start` begins the **normal** Better Auth social sign-in (existing OAuth callback URL
   reused — **no Google/GitHub console change**), carrying `state`/`cc` through to the landing.
3. On success the browser lands on **`/desktop/complete`**, which — with the fresh session — mints a
   **short-lived signed grant** (§4.3) and redirects to `custos://auth/callback?state=<state>&code=<grant>`.
4. **Desktop** catches the `custos://` deep link (single-instance lock + argv parse on Windows),
   **strictly validates shape** (§4.6), confirms `state` matches `pendingAuth`, then calls
   `POST https://97437.dev/api/desktop/token/exchange` `{ state, code, code_verifier }` over HTTPS.
5. Server verifies grant signature, TTL, `stateHash`, and PKCE `codeChallenge` vs `code_verifier`;
   returns `{ token, user }`. The bearer **token never appears in the `custos://` URL** — only inside
   the HTTPS exchange response.
6. Desktop encrypts the token with `safeStorage` (§4.7), caches the public user, emits `auth:changed`,
   clears `pendingAuth`.

### 4.2 Provider/mode selection

`auth:login` carries explicit `{ provider: 'google' | 'github' | 'device' }` so all three are distinct,
testable code paths — never inferred. The modal sends the chosen provider; "Use a sign-in code instead"
sends `provider: 'device'`.

### 4.3 The signed grant (v1) — short-lived, bound, **not replay-proof**

The grant from `/desktop/complete` is signed (HMAC) with a **dedicated secret** `DESKTOP_GRANT_SECRET`
(distinct from `BETTER_AUTH_SECRET`/`KEEP_ACCOUNT_SECRET`). Claims:

| Claim | Purpose |
|---|---|
| `userId` | who the grant is for |
| `stateHash` | hash of the desktop `state` — binds grant to this login attempt |
| `codeChallenge` | PKCE S256 challenge — binds grant to the desktop instance holding the verifier |
| `iat` / `exp` | issued-at / expiry — **short TTL (~120s)** |
| `jti` | unique id, **reserved** for a future replay store |

**v1 properties (use this wording everywhere):** short-lived, **state-bound**, **PKCE-bound**,
tamper-resistant. **NOT strict single-use / NOT replay-proof** — within its ~120s TTL the grant could
in principle be replayed because v1 keeps **no server-side `jti` store**. This is an accepted,
time-boxed risk; never describe v1 grants as replay-proof.

**Future upgrade (real single-use):** add a DB/KV-backed `desktop_grant` / `jti` store and reject any
`jti` already seen. The `jti` claim exists now so this needs no client change.

### 4.4 Fallback — device code (must share the same security as primary)

Triggered when `custos://` return is unavailable/blocked, the primary callback doesn't arrive within
~90s, or the user chooses "Use a sign-in code instead."

1. Desktop requests a device code (Better Auth **device-authorization plugin** if present in
   `better-auth@1.6.12`, else a minimal equivalent endpoint pair).
2. Desktop shows the `user_code`, opens the system browser to `https://97437.dev/device`.
3. User signs in (if needed) and approves the code.
4. Desktop polls at the prescribed interval until it receives the bearer token, then proceeds as in
   §4.1 step 6.

**Device-code is held to the same bar as the primary flow — it is not a second, looser auth system:**

- Same **token scope** (§4.5) and same **banned/deleted** checks (§4.5).
- Same **revoke** behavior on logout (§4.10).
- **Bounded polling:** honor the server `interval`, enforce a max poll duration, back off on
  `slow_down`, and stop on `denied`/`expired`/`error`. **No infinite polling.**
- **Bounded device-code lifetime:** short `expires_in`; expired codes are rejected and the modal shows
  the expiry state (§9).
- Device-code statuses are explicit for the modal: `requesting → awaiting-approval (user_code +
  verification_uri) → polling → authed | denied | expired | error`.

### 4.5 Token model — lifetime, scope, validation, ban/delete cleanup

**Lifetime (explicit, not implicit):** the desktop bearer is **reasonably long-lived** (a desktop
session credential, not a 1-hour token), **validated on startup** (and on demand), and **revoked** on
logout and on banned/deleted/disabled/insufficient-status accounts. There is **no silent background
refresh in v1**; a **refresh strategy is a documented future item** (§15) — when the long-lived token
eventually expires, the app drops to anonymous and prompts re-login with clear copy (§9). Decision:
prefer a long-lived token + startup validation over short-token-with-refresh for v1 simplicity.

**Scope (narrow, enforced server-side):** the desktop token is a **dedicated credential tagged as a
desktop client** — **not** full web-session power. The server authorizes it for **only**:

- identity / session validation (`get-session` and equivalent), and
- Phase-2 report-sharing endpoints (when built).

It **must be rejected** for moderation, profile mutation, messaging, admin actions, and all normal
web-only APIs. Enforcement is **server-side** (a token-type/scope check), never client-trust. Exact
mechanism (session row tagged `client:'desktop'` vs JWT/api-key scope claim) is a plan-time choice; the
**scope-limiting requirement is binding**.

**Validation is the source of truth:** on every startup, main calls `GET /api/auth/get-session` with
the bearer. Cached user (§4.8) is **display-only** and may be shown briefly to avoid a logged-out
flash, but actual auth state is decided by this validation.

**Ban/delete/disable cleanup (explicit):** if the account is banned, deleted, disabled, or loses
required status, validation fails (401 or `status: banned|deleted`). The app then **wipes the local
cached user + token and returns to anonymous mode silently** — no error nag, no broken state. Same
behavior whether the token was obtained via primary or device flow.

### 4.6 Callback hardening

The `custos://` handler accepts **only** `custos://auth/callback?state=…&code=…` with **both** params
present and well-formed. Any other host/path/scheme/shape, missing/garbage params, or a `state` not
matching the current `pendingAuth` is **rejected and logged (non-sensitively)** and never acted on.
A rejected callback **also clears `pendingAuth`** (§4.9).

### 4.7 Secret storage — fail closed (non-negotiable)

- The bearer is stored **only in main**, encrypted via Electron `safeStorage`, persisted as base64 in
  electron-store under `auth`. Decrypted in main only.
- **If `safeStorage.isEncryptionAvailable()` is false/weak, fail closed:** do **not** write a plaintext
  credential to disk. Either keep auth **memory-only for the current run** or **require re-login after
  restart**. The user is informed via clear copy (§9). Never silently downgrade to plaintext.

### 4.8 Renderer isolation — never receives token-like material

The renderer (and anything reachable from it) **never** receives the bearer token, the grant `code`,
the `code_verifier`, or raw auth HTTP responses. The IPC surface returns **only**:

- `status` (`anon | pending | authed`),
- **public user fields** (`id, username, uid, avatarVersion, role, status`), and
- **device-code display/progress** (`user_code`, `verification_uri`, status enum).

Everything sensitive stays in main.

### 4.9 Pending-state lifecycle

`pendingAuth { state, codeVerifier, codeChallenge, provider, startedAt, timer }` is **always cleared**
on every terminal outcome: **success, timeout (~90s → offer device code), user cancel, failure, and
rejected callback** (§4.6). No orphaned timers or deep-link listeners.

### 4.10 Logout — local-wipe first, server-revoke best effort

Logout **deletes the local `safeStorage` token immediately** (local wipe is guaranteed, never blocked).
**Then**, best-effort, it revokes the desktop token server-side (`/api/auth/sign-out` with the bearer,
or a desktop-token revoke endpoint) — but a failed/timed-out revoke call **does not** block or reverse
local logout. Clears cached user, emits `auth:changed`.

### 4.11 Rate limiting & abuse controls (web)

Server-side limits on the desktop auth surface to prevent brute force / abuse:

- **token exchange** attempts (per IP / per `state`),
- **invalid-grant** attempts (tighter, with backoff),
- **device-code creation** (per IP), and
- **device-code polling** (enforce `interval`, emit `slow_down`, cap total polls).

### 4.12 Audit logging (web) — failures only, never secrets

Log security-relevant events: auth failures, exchange failures, revoke, banned/deleted rejection, rate-
limit trips. **Never log** bearer tokens, grants, `code_verifier`, or full callback URLs (log a hash or
the `jti`/`userId` only). Desktop-side logging follows the same redaction rule.

### 4.13 Kill switch — `DESKTOP_AUTH_ENABLED`

A feature flag gates the whole desktop-auth subsystem so it can be turned off if production auth breaks:

- **Web:** when `false`, `/desktop/*` routes and `/api/desktop/token/exchange` (and device endpoints)
  return a clean "desktop auth disabled" response; existing web cookie login is unaffected.
- **Desktop:** a bundled/config flag (and/or a value fetched from the web) hides the auth UI and runs
  the scanner anonymously. The scanner must continue working fully (PR-1/PR-2).

---

## 5. Web-side changes (`custosweb`)

Redeploy once on Railway after these land. No Google/GitHub console changes.

- **Better Auth (`lib/auth.ts`):** add the **`bearer` plugin**; add **`trustedOrigins`**; ensure desktop
  tokens are **scoped** (§4.5); wire **rate limits** (§4.11) and **audit logging** (§4.12).
- **New routes:**
  - `GET /desktop/auth/start` — validate `state`/`cc`/`provider`, kick off social sign-in carrying them.
  - `GET /desktop/complete` — **requires a live session**; mint the signed grant (§4.3); redirect to
    `custos://auth/callback?...`; render a minimal "Return to Custos" page (no session ⇒ bounce to login).
  - `POST /api/desktop/token/exchange` — verify grant (sig, TTL, `stateHash`, PKCE); return `{ token, user }`.
  - `GET /device` approval page + device-authorization endpoints (fallback, §4.4).
- **Kill switch** `DESKTOP_AUTH_ENABLED` gating all of the above (§4.13).
- **Env / secrets (§8):** add `DESKTOP_GRANT_SECRET`.
- **Heed `custosweb/AGENTS.md`:** modified **Next.js 16** (`proxy.ts` replaces `middleware.ts`) — read
  `node_modules/next/dist/docs/` first. Do **not** add `better-auth` to `serverExternalPackages`. Keep
  `kysely@0.28.17` pinned.

---

## 6. Desktop-side changes (`custos`)

### 6.1 Main process

- **`src/main/services/auth-service.ts`** — state/PKCE generation, system-browser open, `custos://`
  handler (strict §4.6), grant exchange, device-code fallback (§4.4), `safeStorage` token store
  (fail-closed §4.7), startup validation + ban/delete cleanup (§4.5), logout/revoke (§4.10), pending-
  state lifecycle (§4.9), kill-switch gating (§4.13), non-sensitive logging (§4.12).
- **Protocol registration** — `app.setAsDefaultProtocolClient('custos')`; `requestSingleInstanceLock` +
  `second-instance` argv parse (Windows), `open-url` (mac dev parity).
- **`openExternal` allowlist** — extend `src/main/utils/url-policy.ts` so the auth flow opens **only**
  expected `https://97437.dev/...` auth/profile/device URLs. **No arbitrary URLs** built from renderer-
  controlled data may be opened. `custos://` is inbound and never goes through `openExternal`.
- **IPC (`ipc-handlers.ts`, zod-validated):** `auth:get-state` → `{status, user|null, device?}`;
  `auth:login` ← `{provider}`; `auth:cancel`; `auth:logout`; push `auth:changed`; device progress via
  `auth:get-state`/a `auth:device` push. Renderer payloads carry **no** token-like material (§4.8).
- **Persistence (`app-store.ts`):** add `auth` key `{ tokenEnc?: string, user?: CachedUser }` beside
  `settings`. Renderer receives `user` only.

### 6.2 Preload (`src/preload/index.ts`)

Add `getAuthState`, `login(provider)`, `cancelLogin`, `logout`, `onAuthChanged(cb)` + device-progress
subscription to the `electronAPI` bridge. Update `shared/global.d.ts` / `shared/types.ts`.

### 6.3 Renderer

- **`stores/auth-store.ts`** — mirrors `settings-store`: hydrate via `getAuthState()` on boot, subscribe
  to `onAuthChanged`, hold `{ status, user, device }` with public fields only.
- **Login modal** (reuse `Modal.tsx`): "Continue with Google" / "Continue with GitHub" (web OAuth-button
  styling, `IconGoogle`/`IconGithub`); a quiet **"Use a sign-in code instead"** reveals the device panel
  (`user_code`, opens `/device`, live status §4.4). Error states per §9.
- **Header user cluster** (`components/layout/Header.tsx`, right of the OS pill): **"Sign in"** when anon;
  **avatar + dropdown** (`UserMenu`) when authed — username (role glow), role badge, "Open profile on
  web", "Sign out".
- **Profile URL (§6.4).**
- **Settings** (`pages/Settings.tsx`): replace the read-only "Appearance" swatch with an **"Account"**
  card (sign-in / profile summary / sign-out).
- **New primitives:** `components/ui/Avatar.tsx` (image + initials fallback + role ring; §6.5) and
  `components/ui/RoleName.tsx` (role-colored, matching web `.role-glow`). No text-input primitive needed
  (social-only).
- **No blocking auth gate** (PR-1). Phase-2 gated actions will check `auth-store`.

### 6.4 Profile URL — stable, not stale

"Open profile on web" must not break if the username changed. The web already exposes a **stable,
id-based entry route** `https://97437.dev/profile/id/<user.id>` (`app/profile/id/[id]/page.tsx`) that
resolves the user server-side and redirects to their canonical handle `/profile/<username>.<uid>`
(`lib/handle.ts` → `profileHandle(username, uid)` = `"<username>.<uid>"`). Decision: open
`/profile/id/<user.id>` — it uses the internal `id` the desktop already holds, survives username
changes, and needs no client-side handle building. The URL is built and opened in the **main process**
(via `auth:open-profile` IPC) so the renderer never constructs a `97437.dev` URL.

### 6.5 Avatar loading — safe and resilient

Avatars load from `https://97437.dev/api/avatar/<id>?v=<avatarVersion>` (public, no auth; already allowed
by the renderer `img-src https:` CSP). **A load failure must not break the UI** — fall back to initials.
**No token-like material in image URLs** (no bearer/grant in query params); only the public `id` + `v`.

---

## 7. Design alignment

### 7.1 Tokens (update `tailwind.config.js` **and** `styles/index.css :root`)

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

### 7.2 Fonts — two deliberate, justified divergences

- **MuseoModerno** stays the single brand display/body face (already shipped).
- **Divergence 1 — keep Inter as the Cyrillic fallback** (desktop has `ru` i18n; web doesn't need it).
  Stack: `['MuseoModerno','Inter','system-ui','sans-serif']`.
- **Divergence 2 — keep a true monospace (JetBrains Mono) for forensic data:** hashes, paths, registry
  keys, timestamps, tabular output. The web's `font-mono → MuseoModerno` brand alias is fine for brand
  UI labels (uppercase, tracked eyebrow), but **forensic readability wins** for data.

### 7.3 Components

Align to web conventions: **Button primary** (caramel fill, `text-on-accent`, `font-display font-bold`,
subtle `hover:-translate-y-0.5`); **OAuth/secondary** (`rounded-xl border-line-strong bg-bg
hover:border-scan hover:text-scan`); **Card** (`rounded-xl border-line bg-panel/40 hover:border-scan/50`
+ glass/elevated); add **eyebrow**, **pill/badge**, **dropdown** conventions; reconcile `.glow-scan` /
`.text-glow`.

### 7.4 No over-animation

Exact palette/type/components — yes. **No smooth-scroll, no WebGL, no marketing-style motion.** Only
tool-appropriate feedback: small hover states, loading/scan progress, modal transitions, clear status
changes. It should feel premium, fast, forensic — not a landing page.

### 7.5 Remove dead themes fully

`aurora`/`mono`/`tropical` are three identical no-op themes. Remove **completely** — no half-removed
state:

- Drop the duplicate `[data-theme="…"]` blocks; keep a single `:root`.
- Set `<html data-theme="dark">` statically (matches web).
- Remove the theme **selector** from `settings-store` and Settings UI, and the **legacy theme settings**.
- Point the main `backgroundColor` (read in `src/main/index.ts` before window creation) at the new `--bg`.
- **Add a migration** so an existing persisted `settings.theme` value doesn't trip the `.strict()` zod
  schema on upgrade (strip/normalize the legacy key in `app-store`).

---

## 8. Persistence & secrets

- **electron-store** gains `auth` `{ tokenEnc?: safeStorage-base64, user?: CachedUser }`, separate from
  `settings`. Token decrypted in main only; renderer gets `user` only (§4.8). Fail-closed (§4.7).
- **`DESKTOP_GRANT_SECRET`** (web) — **separate** from Better Auth secrets; add to `.env.example` and the
  deploy checklist (§11). **Rotation semantics:** rotating it **invalidates outstanding grants** (in-
  flight logins must restart) but **not existing desktop sessions** (those are bearer tokens, validated
  independently) — unless an intentional mass session invalidation is desired.

---

## 9. Error copy / UX states (no generic "Something went wrong")

Each failure mode gets clear, specific user-facing copy:

| Condition | Copy intent |
|---|---|
| Login failed (OAuth/exchange) | "Couldn't complete sign-in. Try again." + retry |
| Callback blocked / no return | "Browser couldn't return to Custos — use a sign-in code instead." → device flow |
| Device code expired | "That code expired. Get a new one." |
| Server unavailable | "Can't reach 97437.dev right now. You can keep using Custos offline." |
| Encryption unavailable (§4.7) | "Secure storage isn't available, so you'll need to sign in again after restart." |
| Banned / deleted account (§4.5) | Silent return to anonymous (no nag); if surfaced, neutral "Signed out." |
| Auth disabled (kill switch) | Auth UI hidden; scanner works normally. |

---

## 10. Testing (vitest, both repos)

**Desktop:** state + PKCE (S256) generation; `custos://` parsing **incl. rejection** of wrong host/path,
missing `state`/`code`, mismatched `state`; grant exchange (happy + error); `safeStorage` round-trip
(mocked) **and** fail-closed when encryption unavailable; pending-state cleared on success/timeout/
cancel/failure/rejected-callback; device-poll loop (interval, slow_down, max duration, denied/expired);
`url-policy` allowlist includes only expected `97437.dev` URLs; avatar initials fallback on load error;
kill-switch off ⇒ no auth UI, scanner works.

**Web:** grant sign/verify (claim set, TTL, `stateHash` + PKCE binding, tamper rejection — **replay-
within-TTL documented as accepted, not tested as prevented**); `/api/desktop/token/exchange` happy +
invalid; bearer scope gate (desktop token cannot hit web-only privileged actions); `/desktop/complete`
requires live session; rate-limit trips; audit log emits non-sensitive entries only; kill switch returns
clean disabled response without affecting web cookie login.

**Production-like (before merge, §13):** run the full flow against a **local `custosweb` dev backend**
first, then a **staging / production-like Railway environment**. Do **not** merge on unit-test green
alone.

---

## 11. Manual Windows verification (must pass before "done")

On a real Windows install:

- [ ] `custos://` protocol registration works.
- [ ] Primary browser auto-return signs the app in.
- [ ] Device-code fallback works when return is blocked.
- [ ] `safeStorage` token persists across app restart (and **fail-closed** path when encryption absent).
- [ ] Logout wipes local token (and best-effort server revoke).
- [ ] Banned/deleted account → silent wipe → anonymous on next validation.
- [ ] **Scanner works fully with no login and no internet** (PR-1).
- [ ] Kill switch off → no auth UI, scanner unaffected (PR-2).

Deploy checklist: generate `DESKTOP_GRANT_SECRET` → add to Railway env → redeploy `custosweb` (web +
worker) → verify protocol registration on a real install → confirm no Google/GitHub console change needed.

---

## 12. Implementation phasing (single PR per repo where sensible; do NOT mix Phase 2)

- **Phase 1A — Web auth endpoints:** `bearer` plugin, `trustedOrigins`, `/desktop/auth/start`,
  `/desktop/complete`, `/api/desktop/token/exchange`, signed grant, device endpoints + `/device`, rate
  limits, audit logging, kill switch, `DESKTOP_GRANT_SECRET`. Tests. (custosweb)
- **Phase 1B — Electron main `AuthService`:** protocol registration, browser OAuth, `custos://` handler,
  grant exchange, device fallback, `safeStorage` (fail-closed), startup validation + ban/delete cleanup,
  logout/revoke, IPC, persistence, kill-switch gating, `openExternal` allowlist. Tests. (custos)
- **Phase 1C — Renderer auth UI:** `auth-store`, login modal (+ device panel), header user menu, avatar,
  role badge, Settings "Account" card, error copy, id-based profile URL. Tests. (custos)
- **Phase 1D — Design alignment / theme cleanup:** token values, fonts, component conventions, full dead-
  theme removal + migration. (custos)
- **Phase 1E — Full manual Windows verification** (§11) end-to-end.

---

## 13. Merge & deploy rules

- **No direct merge to `main` after a huge diff.** Open a PR per repo; review changed files; run
  **typecheck + lint + build + tests in both repos**; then **manually test the login flow** (local →
  production-like, §10) before deployment.
- **Web deploy rollback note:** because this touches Better Auth + Railway, rollback = flip
  `DESKTOP_AUTH_ENABLED=false` (and/or revert the `/desktop/*` + token-exchange routes). Existing web
  cookie login must remain **unaffected** by enabling or rolling back desktop auth.

---

## 14. Phase 2 — Share scan reports to the web (separate spec; privacy model required first)

Built on Phase 1's scoped bearer token: web ingest endpoint + storage + web report-view page + a "Share"
action on the desktop `Results` page (scope-gated to desktop tokens).

**Before building, the Phase 2 spec must define a privacy model — do not upload raw forensic output
blindly.** It must answer:

- What scan data is uploaded vs **redacted**.
- Who can view a shared link; whether links are public/unlisted/auth-gated.
- Whether links **expire**; whether users can **delete** reports.
- Whether reports expose **usernames, file paths, Windows usernames, hardware IDs, IPs, or server/player
  identifiers** — and the redaction/consent policy for each.
- Abuse controls (rate limits, report size caps, takedown).

---

## 15. Open items / future upgrades

- **Strict single-use grants:** DB/KV `jti` store → reject replays (claim already present, §4.3).
- **Token refresh strategy:** decide silent refresh vs re-login prompt when the long-lived desktop token
  expires (§4.5).
- **Device-auth plugin availability:** confirm `better-auth@1.6.12` ships device-authorization; else
  implement the minimal endpoint pair.
- **Kill-switch source:** decide whether desktop reads `DESKTOP_AUTH_ENABLED` purely from its own
  config/build or also honors a value served by the web (for remote disable).
