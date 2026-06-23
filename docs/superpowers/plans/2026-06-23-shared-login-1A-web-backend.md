# Phase 1A — Desktop Auth Web Backend (custosweb) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop-client authentication endpoints to the `custosweb` Next.js app (`97437.dev`) so the `custos` Electron app can sign in with existing Better Auth (Google/GitHub) accounts via a system-browser OAuth handoff (`custos://` deep link + signed grant exchange) or an RFC 8628 device-code fallback, issuing a narrowly-scoped, server-validated bearer token — without affecting existing web cookie login.

**Architecture:** All new routes are gated behind the `DESKTOP_AUTH_ENABLED` kill switch. `/desktop/auth/start` kicks off the normal Better Auth social sign-in (existing OAuth callback URL reused) routed to `/desktop/complete`, which — with a live cookie session — mints a short-lived HMAC-signed *grant* (separate `DESKTOP_GRANT_SECRET`) and 302-redirects to `custos://auth/callback`. The desktop app exchanges that grant at `POST /api/desktop/token/exchange` for a **desktop-scoped Better Auth session token** (a real session row tagged `client_type:'desktop'`). The `bearer` plugin turns `Authorization: Bearer <token>` into that session; a scope guard in `lib/dal.ts` rejects desktop-tagged sessions on every web-only privileged route, allowing them only on `get-session` (and future Phase-2 report endpoints). A device-code fallback reuses the `device-authorization` plugin behind thin contract-shaped wrappers. Rate limiting (existing `rate_limits` table) and a non-sensitive audit log protect the surface.

**Tech Stack:** Next.js 16 (modified — `proxy.ts` replaces `middleware.ts`), React 19, Better Auth `1.6.12` (`bearer` + `device-authorization` plugins), Drizzle ORM + Postgres, `pg`, Node `crypto` (HMAC-SHA256), Vitest 3 (node env), Tailwind v4, TypeScript 5.

## Global Constraints

These are binding for **every** task. (Copied verbatim from the approved spec + interface contract.)

- **PR-1 — Login is optional.** Local scan, local results, local export, and basic settings must work with **no account and no internet**. Login never gates the scanner. (Web side: enabling/rolling back desktop auth must never affect anything outside `/desktop/*` + `/api/desktop/*` + the bearer/scope wiring.)
- **PR-2 — Kill switch.** A feature flag `DESKTOP_AUTH_ENABLED` (default may be on, but flippable to `false`) disables desktop login end-to-end if production auth breaks. With it off, the scanner runs fully anonymously and no auth UI is shown. **Web:** when `false`, `/desktop/*` routes and `/api/desktop/token/exchange` (and device endpoints) return a clean "desktop auth disabled" response; existing web cookie login is unaffected.
- **PR-3 — Phase 1 ≠ report sharing.** Phase 1 is login + identity + profile display + visual alignment only. Report upload/sharing is Phase 2.
- **Modified Next.js 16:** `proxy.ts` replaces `middleware.ts`; if a Next convention is unclear, read `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
- **Do NOT add `better-auth` to `serverExternalPackages`** in `next.config.ts` — it splits the React instance and makes `useSession` throw "invalid hook call" (500 on every page). Only native/server-only libs belong there (`pg`, `sharp`, `@aws-sdk/client-s3`).
- **Pin `kysely@0.28.17`** — 0.29 removed an export Better Auth's bundled kysely-adapter imports, breaking `next build`. Do not bump it.
- **Better Auth core table names** (`user`/`session`/`account`/`verification`) and the new `device_code` table's column/model names must match what the adapter expects (snake_case columns via the Drizzle `casing: "snake_case"` config; model keys camelCase).
- **New dedicated secret `DESKTOP_GRANT_SECRET`** — **separate** from `BETTER_AUTH_SECRET` / `KEEP_ACCOUNT_SECRET`. Rotating it invalidates outstanding *grants* (in-flight logins restart) but **not** existing desktop sessions (those are bearer/session tokens validated independently).
- **The grant (v1) is short-lived, state-bound, PKCE-bound, tamper-resistant, but NOT strict single-use / NOT replay-proof** — within its ~120s TTL it could in principle be replayed because v1 keeps **no server-side `jti` store**. This is an accepted, time-boxed risk. **Never describe v1 grants as replay-proof.** Leave a clearly-marked seam to add a DB/KV `jti` store later (the `jti` claim already exists).
- **Token exchange error codes are fixed:** `400 invalid_request`, `401 invalid_grant`, `410 expired_grant`, `429 rate_limited`, `403 desktop_auth_disabled`. Device-token error codes (RFC 8628): `authorization_pending`, `slow_down`, `expired_token`, `access_denied` (all HTTP 400) plus `200 { token, user }`.
- **Scope rule (binding, server-enforced):** a desktop token is authorized ONLY for `get-session` + (future Phase-2 report) endpoints; it must be **rejected** for all other authenticated/privileged routes (moderation, profile mutation, messaging, admin). Enforcement is server-side, never client-trust.
- **Audit/redaction:** log auth failures, exchange failures, revoke, banned/deleted rejection, rate-limit trips. **Never log** bearer tokens, grants, `code_verifier`, or full callback URLs — log `jti`/`userId`/hashes only.
- **Banned/deleted users → unauthenticated** on every path (the existing `lib/dal.ts` defense-in-depth must keep holding for desktop tokens too).
- **`PublicUser = { id: string, username: string, uid: number, avatarVersion: number, role: string | null, status: 'active' | 'banned' | 'deleted', image?: string | null }`.** Avatar served publicly at `/api/avatar/<id>?v=<avatarVersion>` (already exists; never put a token in the URL).
- **No Google/GitHub console change.** The existing web OAuth provider callback URL is reused unchanged. Redeploy once on Railway after these land.

---

## File Structure (decomposition map)

| File | Responsibility |
|---|---|
| `lib/desktop/flag.ts` (new) | `isDesktopAuthEnabled()` kill-switch reader + `desktopDisabledResponse()` helper. |
| `lib/desktop/grant.ts` (new) | HMAC grant `signGrant()` / `verifyGrant()` + claim types + `sha256b64url`/`pkceChallenge` helpers. |
| `lib/desktop/audit.ts` (new) | `auditDesktop(event, fields)` — non-sensitive, redacted audit logging. |
| `lib/desktop/token.ts` (new) | `mintDesktopSession(userId)` → raw bearer token; `toPublicUser(user)`; `DESKTOP_CLIENT_TYPE`. |
| `lib/desktop/ratelimit.ts` (new) | Named rate-limit wrappers for the desktop surface (keys + limits in one place). |
| `lib/auth.ts` (modify) | Add `bearer` + `deviceAuthorization` plugins, `trustedOrigins`, session `additionalFields.clientType`. |
| `lib/dal.ts` (modify) | Scope guard: `getCurrentUser()` rejects desktop-tagged sessions; add `getDesktopSession()` reader. |
| `lib/db/schema.ts` (modify) | Add `client_type` column to `session`; add `deviceCode` table for the device plugin. |
| `app/desktop/auth/start/route.ts` (new) | Validate params; begin social sign-in carrying state/cc; redirect to provider. |
| `app/desktop/complete/route.ts` (new) | Require session; mint grant; 302 to `custos://...`; render "Return to Custos" HTML. |
| `app/api/desktop/token/exchange/route.ts` (new) | Verify grant; mint desktop bearer; return `{ token, user }`. |
| `app/api/desktop/device/code/route.ts` (new) | Contract-shaped wrapper over the device plugin's `/device/code`. |
| `app/api/desktop/device/token/route.ts` (new) | Contract-shaped wrapper over the device plugin's `/device/token`. |
| `app/api/desktop/token/revoke/route.ts` (new) | Revoke the desktop session via bearer. |
| `app/device/page.tsx` (new) | Session-gated device approval page (approve/deny a `user_code`). |
| `app/device/actions.ts` (new) | Server actions `approveDevice`/`denyDevice` calling the plugin endpoints. |
| `tests/desktop-*.test.ts` (new) | One test file per task as listed below. |
| `.env.example` (modify) | Add `DESKTOP_AUTH_ENABLED` + `DESKTOP_GRANT_SECRET`. |
| `STATUS.md` (modify) | Deploy checklist + rollback note. |

**Verified Better Auth facts this plan is built on** (confirmed against the installed `better-auth@1.6.12` source — do not re-derive):
- `bearer` plugin (`better-auth/plugins/bearer`): converts `Authorization: Bearer <token>` into the session cookie. The `<token>` is the Better Auth **session token**. It accepts **both** the raw DB token (no `.`) — which it self-signs internally — and the signed `rawToken.signature` form. Validation flows through normal session lookup. We return the **raw** `session.token` (exactly what the device plugin returns as `access_token`).
- `ctx = await auth.$context` exposes `ctx.internalAdapter.createSession(userId, dontRememberMe?, override?, overrideAll?)`. The returned session has `.token` (raw, `generateId(32)`), `.expiresAt`, `.userId`. The `override` object injects extra session-row fields (e.g. `{ clientType: "desktop" }`); the `id` key is stripped.
- `auth.api.getSession({ headers })` returns `{ user, session }` (or `null`); with the bearer plugin installed it works for `Authorization: Bearer` too. `session.session` carries the session row incl. our `clientType` additional field.
- `auth.api.signInSocial({ body: { provider, callbackURL, errorCallbackURL, disableRedirect: true } })` returns `{ redirect: boolean, url?: string, token?, user? }`. With `disableRedirect: true` we read `.url` (the provider authorize URL) and 302 to it ourselves.
- `device-authorization` plugin (`better-auth/plugins/device-authorization`) mounts under the Better Auth handler as `auth.api.deviceCode`, `auth.api.deviceToken`, `auth.api.deviceApprove`, `auth.api.deviceDeny`, `auth.api.deviceVerify`. `/device/code` body `{ client_id, scope? }` → `{ device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval }`. `/device/token` body `{ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code, client_id }` → `{ access_token: session.token, token_type, expires_in, scope }` or throws `APIError` with `error` in `{ authorization_pending, slow_down, expired_token, access_denied, invalid_grant }`. It needs a `deviceCode` model/table. **Its created sessions are NOT tagged desktop by default — we re-tag them (see Task 10).**
- `auth.api.getSession` is called in only **2** files: `lib/dal.ts` (the chokepoint behind `getCurrentUser`/`requireUser`, used 73×) and `app/layout.tsx` (display-only). Putting the scope guard in `getCurrentUser` covers every privileged route/action.
- HMAC convention to mirror: `lib/keep-token.ts` (`crypto.createHmac("sha256", secret)`, base64url body+sig, `timingSafeEqual`).
- Rate limiting: `lib/ratelimit.ts` — `checkRateLimit(key, limit, windowSeconds)`, `enforceRateLimit`, `RateLimitError`, `retryAfterHeaders`.

---

### Task 1: Kill-switch flag util

**Files:**
- Create: `lib/desktop/flag.ts`
- Test: `tests/desktop-flag.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isDesktopAuthEnabled(): boolean` — `true` unless `DESKTOP_AUTH_ENABLED` is exactly `"false"` or `"0"` (unset ⇒ enabled, per PR-2 "default may be on").
  - `desktopDisabledResponse(): Response` — a clean JSON `403` `{ error: "desktop_auth_disabled" }` with `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-flag.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";

const prev = process.env.DESKTOP_AUTH_ENABLED;
afterEach(() => {
  if (prev === undefined) delete process.env.DESKTOP_AUTH_ENABLED;
  else process.env.DESKTOP_AUTH_ENABLED = prev;
});

describe("desktop kill switch", () => {
  it("is enabled when unset (default on)", () => {
    delete process.env.DESKTOP_AUTH_ENABLED;
    expect(isDesktopAuthEnabled()).toBe(true);
  });
  it("is enabled when 'true'", () => {
    process.env.DESKTOP_AUTH_ENABLED = "true";
    expect(isDesktopAuthEnabled()).toBe(true);
  });
  it("is DISABLED when 'false'", () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    expect(isDesktopAuthEnabled()).toBe(false);
  });
  it("is DISABLED when '0'", () => {
    process.env.DESKTOP_AUTH_ENABLED = "0";
    expect(isDesktopAuthEnabled()).toBe(false);
  });
  it("disabled response is a 403 with the machine code", async () => {
    const res = desktopDisabledResponse();
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "desktop_auth_disabled" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-flag.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/desktop/flag"` (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desktop/flag.ts
// Web-side kill switch for the entire desktop-auth subsystem (spec §4.13, PR-2).
// Default ON: only the explicit strings "false"/"0" disable it. Flipping this to
// "false" on Railway is the documented rollback (spec §13) and must never affect
// the existing web cookie login.

export function isDesktopAuthEnabled(): boolean {
  const v = process.env.DESKTOP_AUTH_ENABLED;
  return v !== "false" && v !== "0";
}

// Clean "disabled" response for every gated route. 403 + the machine error code
// the desktop client expects; no-store so it is never cached.
export function desktopDisabledResponse(): Response {
  return Response.json(
    { error: "desktop_auth_disabled" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-flag.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/desktop/flag.ts tests/desktop-flag.test.ts
git commit -m "feat(desktop-auth): kill-switch flag util + tests"
```

---

### Task 2: Signed grant sign/verify util

**Files:**
- Create: `lib/desktop/grant.ts`
- Test: `tests/desktop-grant.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface GrantClaims { userId: string; stateHash: string; codeChallenge: string; iat: number; exp: number; jti: string; }`
  - `sha256b64url(input: string): string` — base64url SHA-256 of a UTF-8 string.
  - `pkceChallengeFromVerifier(codeVerifier: string): string` — `base64url(sha256(code_verifier))` (PKCE S256).
  - `signGrant(args: { userId: string; state: string; codeChallenge: string; ttlSeconds?: number }): string` — returns `body.sig` where `body = base64url(JSON(claims))`. Default TTL **120s**. `stateHash = sha256b64url(state)`. `jti = crypto.randomUUID()`.
  - `verifyGrant(token: string): GrantClaims | null` — verifies signature (timing-safe) and that `exp` has not passed; returns claims or `null`. **Does NOT check state/PKCE binding — the exchange route does that** (it has `state` + `code_verifier`).

Note: this util binds the grant cryptographically but is **not replay-proof within its TTL** (no `jti` store in v1) — see Global Constraints. The `jti` claim is present so a future DB/KV store can reject replays with no client change.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-grant.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import {
  signGrant,
  verifyGrant,
  sha256b64url,
  pkceChallengeFromVerifier,
} from "@/lib/desktop/grant";

beforeAll(() => {
  process.env.DESKTOP_GRANT_SECRET ??= "test-desktop-grant-secret-do-not-use";
});

const state = "s".repeat(43);
const verifier = "v".repeat(64);
const cc = pkceChallengeFromVerifier(verifier);

describe("desktop grant", () => {
  it("round-trips with the full claim set", () => {
    const token = signGrant({ userId: "user_1", state, codeChallenge: cc });
    const claims = verifyGrant(token);
    expect(claims).not.toBeNull();
    expect(claims!.userId).toBe("user_1");
    expect(claims!.stateHash).toBe(sha256b64url(state));
    expect(claims!.codeChallenge).toBe(cc);
    expect(typeof claims!.jti).toBe("string");
    expect(claims!.exp).toBeGreaterThan(claims!.iat);
  });

  it("defaults to a ~120s TTL", () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = verifyGrant(signGrant({ userId: "u", state, codeChallenge: cc }))!;
    expect(claims.exp - now).toBeGreaterThan(110);
    expect(claims.exp - now).toBeLessThanOrEqual(120);
  });

  it("rejects a token with no signature separator", () => {
    expect(verifyGrant("garbage")).toBeNull();
  });

  it("rejects a tampered body", () => {
    const token = signGrant({ userId: "u", state, codeChallenge: cc });
    const [body, sig] = token.split(".");
    expect(verifyGrant(`${body}x.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signGrant({ userId: "u", state, codeChallenge: cc });
    const [body] = token.split(".");
    expect(verifyGrant(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects an expired grant (exp in the past)", () => {
    const token = signGrant({ userId: "u", state, codeChallenge: cc, ttlSeconds: -1 });
    expect(verifyGrant(token)).toBeNull();
  });

  it("rejects a grant signed with a different secret", () => {
    const token = signGrant({ userId: "u", state, codeChallenge: cc });
    const prev = process.env.DESKTOP_GRANT_SECRET;
    process.env.DESKTOP_GRANT_SECRET = "a-different-secret";
    try {
      expect(verifyGrant(token)).toBeNull();
    } finally {
      process.env.DESKTOP_GRANT_SECRET = prev;
    }
  });

  it("computes the PKCE S256 challenge as base64url(sha256(verifier))", () => {
    // RFC 7636 Appendix B known vector.
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallengeFromVerifier(v)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-grant.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/desktop/grant"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desktop/grant.ts
import crypto from "node:crypto";

// Short-lived, HMAC-signed grant minted by /desktop/complete and exchanged at
// /api/desktop/token/exchange (spec §4.3). Signed with the DEDICATED secret
// DESKTOP_GRANT_SECRET (NOT BETTER_AUTH_SECRET / KEEP_ACCOUNT_SECRET).
//
// v1 properties: short-lived, state-bound, PKCE-bound, tamper-resistant — but
// NOT strict single-use / NOT replay-proof (no server-side jti store in v1).
// The `jti` claim exists so a future DB/KV store can reject replays with no
// client change. NEVER describe v1 grants as replay-proof.

export interface GrantClaims {
  userId: string;
  stateHash: string; // sha256b64url(state) — binds the grant to this login attempt
  codeChallenge: string; // PKCE S256 challenge — binds to the verifier-holder
  iat: number; // unix seconds
  exp: number; // unix seconds (~120s after iat)
  jti: string; // unique id, reserved for a future replay store
}

const DEFAULT_TTL_SECONDS = 120;

function secret(): string {
  const s = process.env.DESKTOP_GRANT_SECRET;
  if (!s) throw new Error("DESKTOP_GRANT_SECRET is not set");
  return s;
}

export function sha256b64url(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

// PKCE S256: code_challenge = base64url(sha256(code_verifier)). RFC 7636 §4.2.
export function pkceChallengeFromVerifier(codeVerifier: string): string {
  return sha256b64url(codeVerifier);
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signGrant(args: {
  userId: string;
  state: string;
  codeChallenge: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: GrantClaims = {
    userId: args.userId,
    stateHash: sha256b64url(args.state),
    codeChallenge: args.codeChallenge,
    iat: now,
    exp: now + (args.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    jti: crypto.randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body)}`;
}

// Verifies signature (timing-safe) + TTL only. State/PKCE binding is checked by
// the exchange route, which alone holds `state` and `code_verifier`.
//
// SEAM (future strict single-use): after this returns claims, look up claims.jti
// in a desktop_grant / jti store and reject if already seen, then record it.
export function verifyGrant(token: string): GrantClaims | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as GrantClaims;
    if (!claims.userId || !claims.stateHash || !claims.codeChallenge || !claims.exp) return null;
    if (Math.floor(Date.now() / 1000) > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-grant.test.ts`
Expected: PASS (8 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/desktop/grant.ts tests/desktop-grant.test.ts
git commit -m "feat(desktop-auth): HMAC grant sign/verify + PKCE helpers + tests"
```

---

### Task 3: Audit logging util

**Files:**
- Create: `lib/desktop/audit.ts`
- Test: `tests/desktop-audit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DesktopAuditEvent = "auth_failure" | "exchange_failure" | "revoke" | "banned_rejected" | "rate_limited" | "device_denied";`
  - `auditDesktop(event: DesktopAuditEvent, fields?: Record<string, string | number | undefined>): void` — emits one structured `console.warn` line prefixed `[desktop-audit]`. **Strips any field whose key matches a sensitive denylist** (`token`, `grant`, `code`, `code_verifier`, `verifier`, `secret`, `authorization`, `url`) so secrets can never be logged even by mistake (spec §4.12). Only `jti`/`userId`/hashes/codes should be passed in.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-audit.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { auditDesktop } from "@/lib/desktop/audit";

afterEach(() => vi.restoreAllMocks());

describe("desktop audit log", () => {
  it("emits a [desktop-audit] line with the event + safe fields", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    auditDesktop("exchange_failure", { userId: "u1", reason: "invalid_grant" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("[desktop-audit]");
    expect(line).toContain("exchange_failure");
    expect(line).toContain("u1");
    expect(line).toContain("invalid_grant");
  });

  it("NEVER logs sensitive fields even if passed", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    auditDesktop("auth_failure", {
      userId: "u1",
      token: "SECRET_TOKEN",
      code_verifier: "SECRET_VERIFIER",
      url: "https://97437.dev/desktop/complete?code=SECRET",
    } as Record<string, string>);
    const line = String(spy.mock.calls[0][0]);
    expect(line).not.toContain("SECRET_TOKEN");
    expect(line).not.toContain("SECRET_VERIFIER");
    expect(line).not.toContain("SECRET");
    expect(line).toContain("u1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-audit.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/desktop/audit"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desktop/audit.ts
// Non-sensitive, redacted audit logging for the desktop-auth surface (spec §4.12).
// Log security-relevant events only; NEVER log tokens/grants/code_verifier/full
// callback URLs — pass jti/userId/hashes/error-codes only. The denylist below is
// a fail-safe so a caller mistake can't leak a secret.

export type DesktopAuditEvent =
  | "auth_failure"
  | "exchange_failure"
  | "revoke"
  | "banned_rejected"
  | "rate_limited"
  | "device_denied";

const SENSITIVE = new Set([
  "token",
  "grant",
  "code",
  "code_verifier",
  "verifier",
  "secret",
  "authorization",
  "url",
]);

export function auditDesktop(
  event: DesktopAuditEvent,
  fields: Record<string, string | number | undefined> = {},
): void {
  const safe: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (SENSITIVE.has(k.toLowerCase())) continue; // never serialize secrets
    safe[k] = v;
  }
  // Single structured line; ts is server clock, not request-derived.
  console.warn(`[desktop-audit] ${event} ${JSON.stringify(safe)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-audit.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/desktop/audit.ts tests/desktop-audit.test.ts
git commit -m "feat(desktop-auth): redacted audit logging util + tests"
```

---

### Task 4: Schema — tag sessions + device_code table

**Files:**
- Modify: `lib/db/schema.ts` (the `session` table block, lines 95–113; add a new `deviceCode` table after `verification`)
- Test: `tests/desktop-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `session.clientType` column (`text("client_type")`, nullable; `null` = web cookie session, `"desktop"` = desktop bearer session).
  - `deviceCode` Drizzle table named `"deviceCode"` (model key the plugin expects) with columns matching the device-authorization plugin schema: `id`, `deviceCode`, `userCode`, `userId`, `expiresAt`, `status`, `lastPolledAt`, `pollingInterval`, `clientId`, `scope`. Exported `export const deviceCode = pgTable("deviceCode", {...})`.

Important: the device-authorization plugin's model name is `deviceCode` (camelCase). With Drizzle `casing: "snake_case"`, columns map to snake_case automatically, but the **table name must be exactly `deviceCode`** to match the adapter's default model→table mapping. Field names passed to the adapter are camelCase (`deviceCode`, `userCode`, …) so the Drizzle property names below must be those camelCase keys.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-schema.test.ts
import { describe, it, expect } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { session, deviceCode } from "@/lib/db/schema";

describe("desktop schema additions", () => {
  it("session has a client_type column", () => {
    const cols = getTableConfig(session).columns.map((c) => c.name);
    expect(cols).toContain("client_type");
  });

  it("deviceCode table exists with the plugin's fields", () => {
    const cfg = getTableConfig(deviceCode);
    expect(cfg.name).toBe("deviceCode");
    const cols = cfg.columns.map((c) => c.name);
    for (const c of [
      "id",
      "device_code",
      "user_code",
      "user_id",
      "expires_at",
      "status",
      "last_polled_at",
      "polling_interval",
      "client_id",
      "scope",
    ]) {
      expect(cols).toContain(c);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-schema.test.ts`
Expected: FAIL — `session` has no `client_type` and `deviceCode` is not exported (import error / assertion fails).

- [ ] **Step 3: Write minimal implementation**

In `lib/db/schema.ts`, inside the `session` table definition add the `clientType` column after `userId` (keep the existing privacy comment + `index`):

```ts
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // null = a normal web cookie session. "desktop" = a desktop-client bearer
    // session minted via /api/desktop/token/exchange or the device flow. The
    // scope guard in lib/dal.ts rejects "desktop" sessions on web-only routes
    // (spec §4.5). Bearer tokens are validated through the normal session path.
    clientType: text("client_type"),
```

Then add a new table immediately after the `verification` table block (device-authorization plugin storage; column names match its schema):

```ts
// ---- Device-authorization (RFC 8628) codes for the desktop fallback flow ----
// Backs the better-auth device-authorization plugin. Model name MUST be
// "deviceCode" to match the adapter mapping; field (property) names are the
// camelCase keys the plugin reads. Rows are short-lived and deleted by the
// plugin on success/expiry/denial.
export const deviceCode = pgTable(
  "deviceCode",
  {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull(), // pending | approved | denied
    lastPolledAt: timestamp("last_polled_at"),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
  },
  (t) => [
    index("device_code_device_code_idx").on(t.deviceCode),
    index("device_code_user_code_idx").on(t.userCode),
    index("device_code_expires_at_idx").on(t.expiresAt),
  ],
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-schema.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Generate the migration (do not hand-write SQL)**

Run: `npm run db:generate`
Expected: a new file under `lib/db/migrations/` adding the `client_type` column and the `deviceCode` table. (Applied to Railway Postgres later via `npm run db:migrate` in the deploy step — Task 12.)

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations tests/desktop-schema.test.ts
git commit -m "feat(desktop-auth): tag sessions client_type + add deviceCode table"
```

---

### Task 5: Wire bearer + device plugins, trustedOrigins, session field

**Files:**
- Modify: `lib/auth.ts` (imports; `session` config block lines 44–46; `plugins` array line 161; add top-level `trustedOrigins`)
- Test: `tests/desktop-auth-config.test.ts`

**Interfaces:**
- Consumes: nothing new (uses Task 4's `clientType` column at runtime via `additionalFields`).
- Produces:
  - `auth` now has `bearer` + `deviceAuthorization` plugins, `trustedOrigins`, and a session `additionalFields.clientType` so the field round-trips into `getSession`.
  - `auth.api.deviceCode`, `auth.api.deviceToken`, `auth.api.deviceApprove`, `auth.api.deviceDeny`, `auth.api.deviceVerify` callable server-side.
  - `auth.api.getSession` accepts `Authorization: Bearer`.

`trustedOrigins` must include the production origin `https://97437.dev` and the custom scheme `custos://` (Better Auth checks redirect/callback targets against it; the `/desktop/complete` redirect target uses the `custos://` scheme). Use `BETTER_AUTH_URL` for the http origin so dev (`http://localhost:3000`) also works.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-auth-config.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-better-auth-secret-aaaaaaaaaaaaa";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/test";
});

describe("auth config wiring", () => {
  it("registers the bearer and device-authorization plugins", async () => {
    const { auth } = await import("@/lib/auth");
    const ids = (auth.options.plugins ?? []).map((p: { id: string }) => p.id);
    expect(ids).toContain("bearer");
    expect(ids).toContain("device-authorization");
  });

  it("trusts the custos:// scheme and the site origin", async () => {
    const { auth } = await import("@/lib/auth");
    const origins = auth.options.trustedOrigins as string[];
    expect(origins).toContain("custos://");
    expect(origins.some((o) => o.includes("97437.dev") || o.includes("localhost"))).toBe(true);
  });

  it("exposes the device endpoints on auth.api", async () => {
    const { auth } = await import("@/lib/auth");
    expect(typeof auth.api.deviceCode).toBe("function");
    expect(typeof auth.api.deviceToken).toBe("function");
    expect(typeof auth.api.deviceApprove).toBe("function");
  });

  it("declares clientType as a session additional field", async () => {
    const { auth } = await import("@/lib/auth");
    expect(auth.options.session?.additionalFields?.clientType).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-auth-config.test.ts`
Expected: FAIL — `bearer`/`device-authorization` not in plugin ids; `trustedOrigins` undefined.

- [ ] **Step 3: Write minimal implementation**

In `lib/auth.ts`, add imports near the top (after the existing `nextCookies` import):

```ts
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
```

Add a `trustedOrigins` top-level option (place it right after `database:`):

```ts
  // Desktop-auth (spec §5): trust the custom scheme used by the /desktop/complete
  // redirect and the site origin. custos:// is the desktop deep-link target; the
  // http origin covers dev + prod. Enabling this does NOT affect web cookie login.
  trustedOrigins: [
    "custos://",
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ],
```

Extend the `session` config (replace the existing `session: { cookieCache: ... }` block) so `clientType` round-trips through `getSession`:

```ts
  session: {
    cookieCache: { enabled: true, maxAge: 60 },
    // Lets a session row carry a client tag. Desktop sessions are tagged
    // "desktop" at mint time (lib/desktop/token.ts + the device flow re-tag);
    // the scope guard in lib/dal.ts rejects them on web-only routes (spec §4.5).
    additionalFields: {
      clientType: { type: "string", required: false, input: false },
    },
  },
```

Replace the `plugins` array (currently `plugins: [nextCookies()]`) with:

```ts
  plugins: [
    // bearer: turns `Authorization: Bearer <session-token>` into a session so
    // get-session works for desktop tokens (spec §4.5/§5). requireSignature is
    // left false so the raw session token we return at exchange is accepted.
    bearer(),
    // device-authorization: RFC 8628 fallback. Bounded code lifetime + polling
    // interval. verificationUri points at our session-gated /device page.
    deviceAuthorization({
      expiresIn: "10m",
      interval: "5s",
      verificationUri: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/device`,
    }),
    // nextCookies MUST stay last so it can attach Set-Cookie after other plugins.
    nextCookies(),
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-auth-config.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Typecheck (the plugin generics are load-bearing)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts tests/desktop-auth-config.test.ts
git commit -m "feat(desktop-auth): add bearer + device plugins, trustedOrigins, clientType session field"
```

---

### Task 6: Desktop token minting + PublicUser

**Files:**
- Create: `lib/desktop/token.ts`
- Test: `tests/desktop-token.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth`; `User` from `@/lib/db/schema`.
- Produces:
  - `const DESKTOP_CLIENT_TYPE = "desktop" as const;`
  - `interface PublicUser { id: string; username: string; uid: number; avatarVersion: number; role: string | null; status: "active" | "banned" | "deleted"; image?: string | null; }`
  - `toPublicUser(u: User): PublicUser` — projects a DB user row to the public shape (spec §9 / contract item 9).
  - `mintDesktopSession(userId: string): Promise<string>` — creates a Better Auth session tagged `clientType: "desktop"` via `ctx.internalAdapter.createSession(userId, false, { clientType: DESKTOP_CLIENT_TYPE })` and returns the **raw** `session.token` (the bearer the client stores). Throws if creation fails.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-token.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock the auth $context so we can assert mintDesktopSession tags the session
// and returns the raw token, without a real DB.
const createSession = vi.fn(async (userId: string, _drm: boolean, override: Record<string, unknown>) => ({
  token: "raw-token-123",
  userId,
  clientType: override.clientType,
  expiresAt: new Date(Date.now() + 1000),
}));

vi.mock("@/lib/auth", () => ({
  auth: { $context: Promise.resolve({ internalAdapter: { createSession } }) },
}));

import { mintDesktopSession, toPublicUser, DESKTOP_CLIENT_TYPE } from "@/lib/desktop/token";

describe("desktop token", () => {
  it("mints a session tagged desktop and returns the raw token", async () => {
    const token = await mintDesktopSession("user_42");
    expect(token).toBe("raw-token-123");
    expect(createSession).toHaveBeenCalledWith(
      "user_42",
      false,
      expect.objectContaining({ clientType: DESKTOP_CLIENT_TYPE }),
    );
  });

  it("projects a user row to the public shape only", () => {
    const pub = toPublicUser({
      id: "u1",
      username: "alice",
      uid: 7,
      avatarVersion: 3,
      role: "moderator",
      status: "active",
      image: null,
      email: "secret@example.com",
      adminPinHash: "scrypt$...",
    } as never);
    expect(pub).toEqual({
      id: "u1",
      username: "alice",
      uid: 7,
      avatarVersion: 3,
      role: "moderator",
      status: "active",
      image: null,
    });
    expect((pub as Record<string, unknown>).email).toBeUndefined();
    expect((pub as Record<string, unknown>).adminPinHash).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-token.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/desktop/token"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desktop/token.ts
import { auth } from "@/lib/auth";
import type { User } from "@/lib/db/schema";

// A desktop bearer is a real Better Auth SESSION row tagged client_type:"desktop"
// (spec §4.5). The bearer plugin validates `Authorization: Bearer <token>` through
// the normal session path; the scope guard (lib/dal.ts) rejects desktop sessions
// on web-only routes. We return the RAW session.token (what the device plugin also
// returns as access_token) — the bearer plugin self-signs raw tokens internally.

export const DESKTOP_CLIENT_TYPE = "desktop" as const;

export interface PublicUser {
  id: string;
  username: string;
  uid: number;
  avatarVersion: number;
  role: string | null;
  status: "active" | "banned" | "deleted";
  image?: string | null;
}

// Project a full DB user row to the public, token-safe shape (contract item 9).
// Never leak email, pins, internal timestamps, etc.
export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    uid: u.uid,
    avatarVersion: u.avatarVersion,
    role: u.role ?? null,
    status: u.status as PublicUser["status"],
    image: u.image ?? null,
  };
}

// Mint a desktop-scoped session for an already-authenticated userId and return
// the raw bearer token. dontRememberMe=false → the configured (long-lived)
// session expiry, matching the spec's "reasonably long-lived desktop credential".
export async function mintDesktopSession(userId: string): Promise<string> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId, false, {
    clientType: DESKTOP_CLIENT_TYPE,
  });
  if (!session?.token) throw new Error("FAILED_TO_CREATE_DESKTOP_SESSION");
  return session.token;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-token.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/desktop/token.ts tests/desktop-token.test.ts
git commit -m "feat(desktop-auth): mintDesktopSession + toPublicUser"
```

---

### Task 7: Desktop-scope guard in the DAL + get-session reader

**Files:**
- Modify: `lib/dal.ts` (the `getCurrentUser` body, lines 9–20; add `getDesktopSession`)
- Test: `tests/desktop-scope-guard.test.ts`

**Interfaces:**
- Consumes: `DESKTOP_CLIENT_TYPE` from `@/lib/desktop/token`; `auth`, `fullUserById` from `@/lib/auth`.
- Produces:
  - `getCurrentUser()` (unchanged signature `() => Promise<User | null>`) now returns `null` when the resolving session is tagged `clientType === "desktop"` — so every web-only privileged route/action (all 73 call sites) rejects desktop tokens.
  - `getDesktopSession(): Promise<{ user: User } | null>` — the *allowed* path for desktop tokens: resolves the bearer session **regardless** of clientType, still rejecting banned/deleted users. Used by the get-session route (Task 7 step uses it indirectly; the public get-session is the Better Auth `/api/auth/get-session`, but `getDesktopSession` is the helper a Phase-2 report route will use and the test target proving the allow-path works).

The guard reads the session's `clientType` from the full session object (`auth.api.getSession` returns `{ user, session }`, and `session.clientType` carries our additional field).

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-scope-guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const fullUserById = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
  fullUserById: (...a: unknown[]) => fullUserById(...a),
}));

import { getCurrentUser, getDesktopSession } from "@/lib/dal";

const activeUser = { id: "u1", status: "active", username: "alice", uid: 1 };

beforeEach(() => {
  getSession.mockReset();
  fullUserById.mockReset();
  fullUserById.mockResolvedValue(activeUser);
});

describe("desktop scope guard", () => {
  it("getCurrentUser ALLOWS a normal web session (clientType null)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { clientType: null } });
    expect(await getCurrentUser()).toEqual(activeUser);
  });

  it("getCurrentUser REJECTS a desktop-tagged session (web-only routes)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { clientType: "desktop" } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("getDesktopSession ALLOWS a desktop-tagged session (get-session path)", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { clientType: "desktop" } });
    const r = await getDesktopSession();
    expect(r?.user).toEqual(activeUser);
  });

  it("getDesktopSession REJECTS a banned user", async () => {
    getSession.mockResolvedValue({ user: { id: "u1" }, session: { clientType: "desktop" } });
    fullUserById.mockResolvedValue({ ...activeUser, status: "banned" });
    expect(await getDesktopSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-scope-guard.test.ts`
Expected: FAIL — `getDesktopSession` is not exported; `getCurrentUser` does not yet reject desktop sessions.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `lib/dal.ts` (keep the existing header comment + `requireUser`) with:

```ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth, fullUserById } from "@/lib/auth";
import { DESKTOP_CLIENT_TYPE } from "@/lib/desktop/token";
import type { User } from "@/lib/db/schema";

// Resolve the authed user for a request, rejecting banned/deleted accounts on
// every request (defense-in-depth, unchanged). NEW: also reject sessions tagged
// client_type:"desktop" — a desktop bearer is scoped to get-session + future
// Phase-2 report endpoints ONLY and must never reach web-only privileged routes
// (spec §4.5). Because all 73 privileged call sites funnel through here, this one
// guard enforces the scope rule everywhere.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  // Scope guard: desktop tokens are not web-session-equivalent.
  if ((session.session as { clientType?: string | null })?.clientType === DESKTOP_CLIENT_TYPE) {
    return null;
  }
  const user = await fullUserById(session.user.id);
  if (!user || user.status === "banned" || user.status === "deleted") return null;
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

// The ALLOWED path for desktop bearer tokens: resolve the session regardless of
// clientType, still rejecting banned/deleted users. Used by get-session-style
// reads and (Phase 2) report endpoints — the only surfaces a desktop token may
// touch. NOT request-memoized (it may run with different bearer headers).
export async function getDesktopSession(): Promise<{ user: User } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const user = await fullUserById(session.user.id);
  if (!user || user.status === "banned" || user.status === "deleted") return null;
  return { user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-scope-guard.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Run the full existing suite (no regressions in dal consumers)**

Run: `npx vitest run`
Expected: PASS — all prior tests still green (the guard only adds a desktop-specific rejection branch).

- [ ] **Step 6: Commit**

```bash
git add lib/dal.ts tests/desktop-scope-guard.test.ts
git commit -m "feat(desktop-auth): scope guard rejecting desktop sessions on web-only routes"
```

---

### Task 8: Named rate-limit wrappers

**Files:**
- Create: `lib/desktop/ratelimit.ts`
- Test: `tests/desktop-ratelimit.test.ts`

**Interfaces:**
- Consumes: `checkRateLimit`, `RateLimitError` from `@/lib/ratelimit`.
- Produces (all return `Promise<void>`, throw `RateLimitError` on trip — the route maps that to its machine code):
  - `limitExchange(ip: string): Promise<void>` — 30 / 60s per IP.
  - `limitInvalidGrant(ip: string): Promise<void>` — tighter, 10 / 300s per IP (called only on a *failed* verify, with backoff via the window).
  - `limitDeviceCodeCreate(ip: string): Promise<void>` — 10 / 60s per IP.
  - `limitDeviceTokenPoll(deviceCode: string): Promise<void>` — 1 / 4s per device_code (complements the plugin's own 5s `slow_down`), 60 / 600s ceiling per code.

Each wrapper hashes/keys safely (the device_code is hashed before becoming a rate-limit key so the raw code never lands in the `rate_limits` table).

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-ratelimit.test.ts
import { describe, it, expect, vi } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ratelimit")>("@/lib/ratelimit");
  return { ...actual, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) };
});

import { limitExchange, limitInvalidGrant } from "@/lib/desktop/ratelimit";
import { RateLimitError } from "@/lib/ratelimit";

describe("desktop rate limits", () => {
  it("passes through when under the limit", async () => {
    checkRateLimit.mockResolvedValue({ ok: true, count: 1, retryAfterSeconds: 60 });
    await expect(limitExchange("1.2.3.4")).resolves.toBeUndefined();
  });

  it("throws RateLimitError when over the limit", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, count: 99, retryAfterSeconds: 42 });
    await expect(limitExchange("1.2.3.4")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("invalid-grant limit uses a distinct, tighter key namespace", async () => {
    checkRateLimit.mockResolvedValue({ ok: true, count: 1, retryAfterSeconds: 300 });
    await limitInvalidGrant("1.2.3.4");
    const key = checkRateLimit.mock.calls.at(-1)![0] as string;
    expect(key).toContain("desktop:invalid-grant:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-ratelimit.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/desktop/ratelimit"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/desktop/ratelimit.ts
import crypto from "node:crypto";
import { checkRateLimit, RateLimitError } from "@/lib/ratelimit";

// Named rate-limit wrappers for the desktop-auth surface (spec §4.11). One place
// for every key + budget. Throw RateLimitError on trip; the route maps it to its
// machine code (429 rate_limited / slow_down). The device_code is HASHED before
// it becomes a key so the raw code never lands in the rate_limits table.

async function limit(key: string, max: number, windowSeconds: number): Promise<void> {
  const { ok, retryAfterSeconds } = await checkRateLimit(key, max, windowSeconds);
  if (!ok) throw new RateLimitError(retryAfterSeconds);
}

function h(s: string): string {
  return crypto.createHash("sha256").update(s).digest("base64url").slice(0, 16);
}

export function limitExchange(ip: string): Promise<void> {
  return limit(`desktop:exchange:${ip}`, 30, 60);
}

// Tighter, with backoff via the window. Called only on a FAILED grant verify.
export function limitInvalidGrant(ip: string): Promise<void> {
  return limit(`desktop:invalid-grant:${ip}`, 10, 300);
}

export function limitDeviceCodeCreate(ip: string): Promise<void> {
  return limit(`desktop:device-code:${ip}`, 10, 60);
}

// Two layers: a 4s floor per code (complements the plugin's 5s slow_down) and a
// hard ceiling so a single code can't be polled unboundedly.
export async function limitDeviceTokenPoll(deviceCode: string): Promise<void> {
  await limit(`desktop:device-poll-floor:${h(deviceCode)}`, 1, 4);
  await limit(`desktop:device-poll-cap:${h(deviceCode)}`, 60, 600);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-ratelimit.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add lib/desktop/ratelimit.ts tests/desktop-ratelimit.test.ts
git commit -m "feat(desktop-auth): named rate-limit wrappers for the desktop surface"
```

---

### Task 9: `/desktop/auth/start` route

**Files:**
- Create: `app/desktop/auth/start/route.ts`
- Test: `tests/desktop-start-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`, `desktopDisabledResponse` (`@/lib/desktop/flag`); `auth` (`@/lib/auth`); `auditDesktop` (`@/lib/desktop/audit`).
- Produces: `GET(req: Request): Promise<Response>` for `GET /desktop/auth/start?state=&cc=&provider=`.
  - Validates `state` (43–128 urlsafe chars `[A-Za-z0-9._~-]`), `cc` (43–128 urlsafe base64url), `provider ∈ {google, github}`. Invalid ⇒ `400 { error: "invalid_request" }`.
  - Kill switch off ⇒ `desktopDisabledResponse()`.
  - Calls `auth.api.signInSocial({ body: { provider, callbackURL, errorCallbackURL, disableRedirect: true } })` where `callbackURL = /desktop/complete?state=<state>&cc=<cc>` (absolute, on `BETTER_AUTH_URL`). Reads `.url` and `302`-redirects the browser to the provider. (Existing OAuth provider callback URL unchanged — Better Auth's own `/api/auth/callback/<provider>` is reused; our `callbackURL` is the post-login landing.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-start-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const signInSocial = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { signInSocial: (...a: unknown[]) => signInSocial(...a) } } }));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { GET } from "@/app/desktop/auth/start/route";

const STATE = "s".repeat(43);
const CC = "c".repeat(43);

function call(qs: string) {
  return GET(new Request(`https://97437.dev/desktop/auth/start?${qs}`));
}

beforeEach(() => {
  signInSocial.mockReset();
  process.env.BETTER_AUTH_URL = "https://97437.dev";
  delete process.env.DESKTOP_AUTH_ENABLED;
});

describe("GET /desktop/auth/start", () => {
  it("400s on a bad provider", async () => {
    const res = await call(`state=${STATE}&cc=${CC}&provider=evil`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("400s on a too-short state", async () => {
    const res = await call(`state=short&cc=${CC}&provider=google`);
    expect(res.status).toBe(400);
  });

  it("403s when the kill switch is off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    const res = await call(`state=${STATE}&cc=${CC}&provider=google`);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("desktop_auth_disabled");
  });

  it("302-redirects to the provider URL carrying state+cc in callbackURL", async () => {
    signInSocial.mockResolvedValue({ redirect: true, url: "https://accounts.google.com/o/oauth2/v2/auth?x=1" });
    const res = await call(`state=${STATE}&cc=${CC}&provider=google`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    const body = signInSocial.mock.calls[0][0].body;
    expect(body.provider).toBe("google");
    expect(body.callbackURL).toContain("/desktop/complete");
    expect(body.callbackURL).toContain(`state=${STATE}`);
    expect(body.callbackURL).toContain(`cc=${CC}`);
    expect(body.disableRedirect).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-start-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/desktop/auth/start/route"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/desktop/auth/start/route.ts
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import { auth } from "@/lib/auth";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URLSAFE = /^[A-Za-z0-9._~-]{43,128}$/;
const PROVIDERS = new Set(["google", "github"]);

function bad(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

// GET /desktop/auth/start?state=&cc=&provider= — validate params, then begin the
// NORMAL Better Auth social sign-in with callbackURL routed to /desktop/complete
// carrying state+cc. The existing provider callback URL is unchanged (spec §4.1).
export async function GET(req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();

  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const cc = url.searchParams.get("cc") ?? "";
  const provider = url.searchParams.get("provider") ?? "";

  if (!URLSAFE.test(state) || !URLSAFE.test(cc) || !PROVIDERS.has(provider)) {
    auditDesktop("auth_failure", { stage: "start", reason: "invalid_params" });
    return bad();
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const callbackURL = `${base}/desktop/complete?state=${encodeURIComponent(state)}&cc=${encodeURIComponent(cc)}`;

  try {
    const result = await auth.api.signInSocial({
      body: {
        provider: provider as "google" | "github",
        callbackURL,
        errorCallbackURL: `${base}/login?error=desktop`,
        disableRedirect: true,
      },
    });
    if (!result?.url) {
      auditDesktop("auth_failure", { stage: "start", reason: "no_provider_url" });
      return bad();
    }
    return Response.redirect(result.url, 302);
  } catch {
    auditDesktop("auth_failure", { stage: "start", reason: "signin_threw" });
    return bad();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-start-route.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/auth/start/route.ts tests/desktop-start-route.test.ts
git commit -m "feat(desktop-auth): GET /desktop/auth/start kicks off social sign-in"
```

---

### Task 10: `/desktop/complete` route (grant mint + custos:// redirect)

**Files:**
- Create: `app/desktop/complete/route.ts`
- Test: `tests/desktop-complete-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`, `desktopDisabledResponse` (`@/lib/desktop/flag`); `auth` (`@/lib/auth`); `signGrant` (`@/lib/desktop/grant`); `auditDesktop` (`@/lib/desktop/audit`).
- Produces: `GET(req: Request): Promise<Response>` for `GET /desktop/complete?state=&cc=`.
  - Kill switch off ⇒ disabled response.
  - Requires a **live cookie session** (`auth.api.getSession({ headers })`). No session ⇒ `302` to `/login?next=<this url>` (bounce to login then back).
  - Validates `state`/`cc` shape (same regex as Task 9). Invalid ⇒ `400`.
  - Mints `grant = signGrant({ userId, state, codeChallenge: cc })` and renders a minimal "Return to Custos" HTML page that **also** triggers the `custos://auth/callback?state=<state>&code=<grant>` redirect (via a `<meta http-equiv refresh>` + an explicit link). Returns `text/html`, `Cache-Control: no-store`. (A 302 to a custom scheme is unreliable cross-browser; the HTML page is the canonical "Return to Custos" surface the spec requires, and it issues the deep link.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-complete-route.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } } }));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { GET } from "@/app/desktop/complete/route";
import { verifyGrant, sha256b64url } from "@/lib/desktop/grant";

const STATE = "s".repeat(43);
const CC = "c".repeat(43);

beforeAll(() => {
  process.env.DESKTOP_GRANT_SECRET ??= "test-desktop-grant-secret-do-not-use";
  process.env.BETTER_AUTH_URL = "https://97437.dev";
});
beforeEach(() => {
  getSession.mockReset();
  delete process.env.DESKTOP_AUTH_ENABLED;
});

function call() {
  return GET(new Request(`https://97437.dev/desktop/complete?state=${STATE}&cc=${CC}`));
}

describe("GET /desktop/complete", () => {
  it("403s when the kill switch is off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    getSession.mockResolvedValue({ user: { id: "u1" } });
    expect((await call()).status).toBe(403);
  });

  it("bounces to /login when there is no session", async () => {
    getSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?next=");
  });

  it("renders Return-to-Custos HTML with a valid custos:// deep link + grant", async () => {
    getSession.mockResolvedValue({ user: { id: "user_77" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Return to Custos");
    const m = html.match(/custos:\/\/auth\/callback\?state=([^&"]+)&code=([^"&]+)/);
    expect(m).not.toBeNull();
    expect(decodeURIComponent(m![1])).toBe(STATE);
    const claims = verifyGrant(decodeURIComponent(m![2]));
    expect(claims).not.toBeNull();
    expect(claims!.userId).toBe("user_77");
    expect(claims!.stateHash).toBe(sha256b64url(STATE));
    expect(claims!.codeChallenge).toBe(CC);
    // The token must NOT appear in any logged URL (handled by audit redaction).
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-complete-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/desktop/complete/route"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/desktop/complete/route.ts
import { headers } from "next/headers";
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import { auth } from "@/lib/auth";
import { signGrant } from "@/lib/desktop/grant";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const URLSAFE = /^[A-Za-z0-9._~-]{43,128}$/;

function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// GET /desktop/complete?state=&cc= — requires a live cookie session; mints the
// signed grant and returns the "Return to Custos" page, which fires the
// custos://auth/callback deep link carrying state+grant (spec §4.1 step 3).
// The bearer token NEVER appears here — only the short-lived grant does.
export async function GET(req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();

  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const cc = url.searchParams.get("cc") ?? "";

  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session?.user?.id) {
    // Bounce through login, then back to this exact completion URL.
    const next = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${url.origin}/login?next=${next}`, 302);
  }

  if (!URLSAFE.test(state) || !URLSAFE.test(cc)) {
    auditDesktop("auth_failure", { stage: "complete", reason: "invalid_params", userId: session.user.id });
    return Response.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const grant = signGrant({ userId: session.user.id, state, codeChallenge: cc });
  const deepLink = `custos://auth/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(grant)}`;
  const safeLink = htmlEscape(deepLink);

  // Redact: log only userId + a state hash marker, never the grant or full URL.
  auditDesktop("auth_failure", { stage: "complete_ok", userId: session.user.id });

  const body = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="0; url=${safeLink}" />
<title>Return to Custos</title>
<style>
  body { background:#0a0908; color:#f4f0ea; font-family:system-ui,sans-serif; display:grid; place-items:center; min-height:100vh; margin:0; }
  .card { text-align:center; padding:2rem; }
  a { color:#c89a6a; }
</style>
</head>
<body>
  <div class="card">
    <h1>Return to Custos</h1>
    <p>Signing you in… you can close this tab.</p>
    <p>If nothing happens, <a href="${safeLink}">click here to return to Custos</a>.</p>
  </div>
  <script nonce="">location.href=${JSON.stringify(deepLink)};</script>
</body>
</html>`;

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
```

Note on CSP: `proxy.ts` only nonces document requests it matches; this route returns its own HTML. The inline `<script>` has an empty nonce and the strict CSP would block it, but the `<meta http-equiv="refresh">` and the explicit link are the reliable deep-link triggers and need no script. The script is a progressive-enhancement fallback; if a future CSP audit flags it, drop the `<script>` line — the meta-refresh + link satisfy the spec's "Return to Custos" requirement on their own. (Do not add inline-script CSP exceptions for this route.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-complete-route.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add app/desktop/complete/route.ts tests/desktop-complete-route.test.ts
git commit -m "feat(desktop-auth): GET /desktop/complete mints grant + custos:// return page"
```

---

### Task 11: `/api/desktop/token/exchange` route

**Files:**
- Create: `app/api/desktop/token/exchange/route.ts`
- Test: `tests/desktop-exchange-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`/`desktopDisabledResponse`; `verifyGrant`, `sha256b64url`, `pkceChallengeFromVerifier` (`@/lib/desktop/grant`); `mintDesktopSession`, `toPublicUser` (`@/lib/desktop/token`); `fullUserById` (`@/lib/auth`); `limitExchange`, `limitInvalidGrant` (`@/lib/desktop/ratelimit`); `RateLimitError` (`@/lib/ratelimit`); `auditDesktop`.
- Produces: `POST(req: Request): Promise<Response>` for `POST /api/desktop/token/exchange` body `{ state, code, code_verifier }`.
  - Kill switch off ⇒ `403 { error: "desktop_auth_disabled" }`.
  - Rate-limit per IP (`limitExchange`) ⇒ on trip `429 { error: "rate_limited" }`.
  - Bad/missing body fields ⇒ `400 { error: "invalid_request" }`.
  - `verifyGrant(code)` returns `null` because **signature invalid** ⇒ `401 { error: "invalid_grant" }`; because **expired** is indistinguishable from a bad sig in `verifyGrant`, so the route first checks expiry on a *separately decoded* exp to return `410 { error: "expired_grant" }` when the signature is valid but `exp` passed. (Implementation: `verifyGrant` rejects expired; the route re-derives expiry via a signature-checked decode to choose 410 vs 401 — see code.)
  - `stateHash !== sha256b64url(state)` or `codeChallenge !== pkceChallengeFromVerifier(code_verifier)` ⇒ `401 { error: "invalid_grant" }` (binding mismatch). Each invalid-grant outcome also calls `limitInvalidGrant(ip)` + `auditDesktop("exchange_failure", …)`.
  - Banned/deleted user ⇒ `401 { error: "invalid_grant" }` + `auditDesktop("banned_rejected", …)`.
  - Success ⇒ `mintDesktopSession(userId)`, `200 { token, user: PublicUser }`, `Cache-Control: no-store`.

For the 410-vs-401 split: add `verifyGrantSignature(token): { valid: boolean; expired: boolean; claims?: GrantClaims }` to `lib/desktop/grant.ts` (signature-only check + exp inspection), and have `verifyGrant` delegate to it. Update Task 2's file accordingly (shown here so the exchange route can distinguish expired).

- [ ] **Step 1: Extend the grant util for 410-vs-401 (write the failing test addition)**

Append to `tests/desktop-grant.test.ts`:

```ts
import { verifyGrantSignature } from "@/lib/desktop/grant";

describe("verifyGrantSignature (410 vs 401)", () => {
  const s = "s".repeat(43);
  const c = "c".repeat(43);
  it("reports a valid, unexpired grant", () => {
    const r = verifyGrantSignature(signGrant({ userId: "u", state: s, codeChallenge: c }));
    expect(r.valid).toBe(true);
    expect(r.expired).toBe(false);
    expect(r.claims?.userId).toBe("u");
  });
  it("reports valid-but-expired", () => {
    const r = verifyGrantSignature(signGrant({ userId: "u", state: s, codeChallenge: c, ttlSeconds: -1 }));
    expect(r.valid).toBe(true);
    expect(r.expired).toBe(true);
  });
  it("reports invalid signature", () => {
    const r = verifyGrantSignature("body.deadbeef");
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-grant.test.ts`
Expected: FAIL — `verifyGrantSignature` is not exported.

- [ ] **Step 3: Add `verifyGrantSignature` to `lib/desktop/grant.ts`**

Insert before `verifyGrant` and refactor `verifyGrant` to delegate:

```ts
// Signature-checked decode that ALSO reports expiry, so the exchange route can
// return 410 expired_grant (valid sig, exp passed) vs 401 invalid_grant.
export function verifyGrantSignature(
  token: string,
): { valid: boolean; expired: boolean; claims?: GrantClaims } {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return { valid: false, expired: false };
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valid: false, expired: false };
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as GrantClaims;
    if (!claims.userId || !claims.stateHash || !claims.codeChallenge || !claims.exp) {
      return { valid: false, expired: false };
    }
    const expired = Math.floor(Date.now() / 1000) > claims.exp;
    return { valid: true, expired, claims };
  } catch {
    return { valid: false, expired: false };
  }
}
```

And replace the body of `verifyGrant` with:

```ts
export function verifyGrant(token: string): GrantClaims | null {
  const r = verifyGrantSignature(token);
  if (!r.valid || r.expired || !r.claims) return null;
  return r.claims;
}
```

- [ ] **Step 4: Run to verify the grant suite passes**

Run: `npx vitest run tests/desktop-grant.test.ts`
Expected: PASS (all, including the 3 new cases).

- [ ] **Step 5: Write the failing exchange-route test**

```ts
// tests/desktop-exchange-route.test.ts
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const fullUserById = vi.fn();
const mintDesktopSession = vi.fn(async () => "raw-bearer-xyz");

vi.mock("@/lib/auth", () => ({ fullUserById: (...a: unknown[]) => fullUserById(...a) }));
vi.mock("@/lib/desktop/token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/desktop/token")>("@/lib/desktop/token");
  return { ...actual, mintDesktopSession: () => mintDesktopSession() };
});
vi.mock("@/lib/desktop/ratelimit", () => ({
  limitExchange: vi.fn(async () => {}),
  limitInvalidGrant: vi.fn(async () => {}),
}));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { POST } from "@/app/api/desktop/token/exchange/route";
import { signGrant, pkceChallengeFromVerifier } from "@/lib/desktop/grant";

const STATE = "s".repeat(43);
const VERIFIER = "v".repeat(64);
const CC = pkceChallengeFromVerifier(VERIFIER);

beforeAll(() => {
  process.env.DESKTOP_GRANT_SECRET ??= "test-desktop-grant-secret-do-not-use";
});
beforeEach(() => {
  fullUserById.mockReset();
  fullUserById.mockResolvedValue({
    id: "user_5", username: "bob", uid: 5, avatarVersion: 0, role: null, status: "active", image: null,
  });
  delete process.env.DESKTOP_AUTH_ENABLED;
});

function post(body: unknown) {
  return POST(new Request("https://97437.dev/api/desktop/token/exchange", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
}

describe("POST /api/desktop/token/exchange", () => {
  it("403 desktop_auth_disabled when off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    const res = await post({ state: STATE, code: "x", code_verifier: VERIFIER });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("desktop_auth_disabled");
  });

  it("400 invalid_request on a missing field", async () => {
    const res = await post({ state: STATE, code: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("401 invalid_grant on a bad signature", async () => {
    const res = await post({ state: STATE, code: "body.deadbeef", code_verifier: VERIFIER });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("410 expired_grant on a valid but expired grant", async () => {
    const code = signGrant({ userId: "user_5", state: STATE, codeChallenge: CC, ttlSeconds: -1 });
    const res = await post({ state: STATE, code, code_verifier: VERIFIER });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe("expired_grant");
  });

  it("401 invalid_grant on a state mismatch", async () => {
    const code = signGrant({ userId: "user_5", state: STATE, codeChallenge: CC });
    const res = await post({ state: "x".repeat(43), code, code_verifier: VERIFIER });
    expect(res.status).toBe(401);
  });

  it("401 invalid_grant on a PKCE mismatch", async () => {
    const code = signGrant({ userId: "user_5", state: STATE, codeChallenge: CC });
    const res = await post({ state: STATE, code, code_verifier: "wrong".repeat(13) });
    expect(res.status).toBe(401);
  });

  it("401 invalid_grant for a banned user", async () => {
    fullUserById.mockResolvedValue({ id: "user_5", username: "bob", uid: 5, avatarVersion: 0, role: null, status: "banned", image: null });
    const code = signGrant({ userId: "user_5", state: STATE, codeChallenge: CC });
    const res = await post({ state: STATE, code, code_verifier: VERIFIER });
    expect(res.status).toBe(401);
  });

  it("200 { token, user } on success", async () => {
    const code = signGrant({ userId: "user_5", state: STATE, codeChallenge: CC });
    const res = await post({ state: STATE, code, code_verifier: VERIFIER });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("raw-bearer-xyz");
    expect(json.user).toEqual({ id: "user_5", username: "bob", uid: 5, avatarVersion: 0, role: null, status: "active", image: null });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/desktop-exchange-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/desktop/token/exchange/route"`.

- [ ] **Step 7: Write the route**

```ts
// app/api/desktop/token/exchange/route.ts
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import {
  verifyGrantSignature,
  sha256b64url,
  pkceChallengeFromVerifier,
} from "@/lib/desktop/grant";
import { mintDesktopSession, toPublicUser } from "@/lib/desktop/token";
import { fullUserById } from "@/lib/auth";
import { limitExchange, limitInvalidGrant } from "@/lib/desktop/ratelimit";
import { RateLimitError, retryAfterHeaders } from "@/lib/ratelimit";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function err(code: string, status: number, extra?: Record<string, string>): Response {
  return Response.json({ error: code }, { status, headers: { ...noStore, ...extra } });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] ?? "").trim() || "unknown";
}

// POST /api/desktop/token/exchange { state, code, code_verifier }
// Verifies the grant (sig, TTL, stateHash, PKCE), then mints a desktop-scoped
// bearer. Error codes are fixed (spec §9): 400 invalid_request, 401 invalid_grant,
// 410 expired_grant, 429 rate_limited, 403 desktop_auth_disabled.
export async function POST(req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();

  const ip = clientIp(req);
  try {
    await limitExchange(ip);
  } catch (e) {
    if (e instanceof RateLimitError) {
      auditDesktop("rate_limited", { stage: "exchange", ip });
      return err("rate_limited", 429, retryAfterHeaders(e));
    }
    throw e;
  }

  let body: { state?: unknown; code?: unknown; code_verifier?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err("invalid_request", 400);
  }
  const { state, code, code_verifier } = body;
  if (typeof state !== "string" || typeof code !== "string" || typeof code_verifier !== "string") {
    return err("invalid_request", 400);
  }

  const sig = verifyGrantSignature(code);
  if (!sig.valid || !sig.claims) {
    await limitInvalidGrant(ip).catch(() => {});
    auditDesktop("exchange_failure", { reason: "bad_signature", ip });
    return err("invalid_grant", 401);
  }
  if (sig.expired) {
    auditDesktop("exchange_failure", { reason: "expired", userId: sig.claims.userId });
    return err("expired_grant", 410);
  }

  const claims = sig.claims;
  if (
    claims.stateHash !== sha256b64url(state) ||
    claims.codeChallenge !== pkceChallengeFromVerifier(code_verifier)
  ) {
    await limitInvalidGrant(ip).catch(() => {});
    auditDesktop("exchange_failure", { reason: "binding_mismatch", userId: claims.userId });
    return err("invalid_grant", 401);
  }

  const user = await fullUserById(claims.userId);
  if (!user || user.status === "banned" || user.status === "deleted") {
    auditDesktop("banned_rejected", { stage: "exchange", userId: claims.userId });
    return err("invalid_grant", 401);
  }

  const token = await mintDesktopSession(user.id);
  return Response.json({ token, user: toPublicUser(user) }, { headers: noStore });
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/desktop-exchange-route.test.ts`
Expected: PASS (9 passing).

- [ ] **Step 9: Commit**

```bash
git add lib/desktop/grant.ts app/api/desktop/token/exchange/route.ts tests/desktop-grant.test.ts tests/desktop-exchange-route.test.ts
git commit -m "feat(desktop-auth): POST /api/desktop/token/exchange (grant→bearer)"
```

---

### Task 12: get-session via bearer + scope-rejection proof (integration test)

**Files:**
- Test only: `tests/desktop-bearer-scope.test.ts`

**Interfaces:**
- Consumes: the real `lib/dal.ts` `getCurrentUser`/`getDesktopSession`; a mocked `auth.api.getSession` returning a desktop-tagged session for a bearer header.
- Produces: nothing (proof test). Proves contract items 6 + 7: a desktop bearer (a) resolves a session for the get-session path, and (b) is **rejected** on a web-only privileged route (`getCurrentUser` ⇒ null, so e.g. `POST /api/messages` returns 401).

This task has no implementation step — the behavior was built in Task 7. It is a separate, independently-reviewable proof that the scope rule holds end-to-end against a representative web-only route handler.

- [ ] **Step 1: Write the proof test**

```ts
// tests/desktop-bearer-scope.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const fullUserById = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ authorization: "Bearer raw-bearer-xyz" }) }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
  fullUserById: (...a: unknown[]) => fullUserById(...a),
}));
// Stub the DB + dm libs the messages route imports so it loads under vitest.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/dm", () => ({ sendDm: vi.fn(), listThread: vi.fn(), unreadCount: vi.fn(), }));
vi.mock("@/lib/ratelimit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ratelimit")>("@/lib/ratelimit");
  return { ...actual, enforceRateLimit: vi.fn(async () => {}) };
});

import { getCurrentUser, getDesktopSession } from "@/lib/dal";

const desktopUser = { id: "u9", status: "active", username: "carol", uid: 9 };

beforeEach(() => {
  getSession.mockReset();
  fullUserById.mockReset();
  fullUserById.mockResolvedValue(desktopUser);
  // The bearer plugin would resolve THIS desktop-tagged session for the token.
  getSession.mockResolvedValue({ user: { id: "u9" }, session: { clientType: "desktop" } });
});

describe("desktop bearer scope (contract items 6 + 7)", () => {
  it("ALLOWS the desktop bearer on the get-session path", async () => {
    const r = await getDesktopSession();
    expect(r?.user).toEqual(desktopUser);
  });

  it("REJECTS the desktop bearer on a web-only route (getCurrentUser ⇒ null)", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("a representative web-only route (POST /api/messages) returns 401 for a desktop bearer", async () => {
    const { POST } = await import("@/app/api/messages/route");
    const res = await POST(
      new Request("https://97437.dev/api/messages", {
        method: "POST",
        body: JSON.stringify({ to: "someone", body: "hi" }),
        headers: { "content-type": "application/json", authorization: "Bearer raw-bearer-xyz" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify it passes (behavior already implemented in Task 7)**

Run: `npx vitest run tests/desktop-bearer-scope.test.ts`
Expected: PASS (3 passing). If the messages route's imports need more stubs to load, add the minimal `vi.mock` for them — do not change route logic.

- [ ] **Step 3: Commit**

```bash
git add tests/desktop-bearer-scope.test.ts
git commit -m "test(desktop-auth): prove desktop bearer is scope-rejected on web-only routes"
```

---

### Task 13: Revoke endpoint

**Files:**
- Create: `app/api/desktop/token/revoke/route.ts`
- Test: `tests/desktop-revoke-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`/`desktopDisabledResponse`; `auth` (`@/lib/auth`); `auditDesktop`.
- Produces: `POST(req: Request): Promise<Response>` for `POST /api/desktop/token/revoke`.
  - Kill switch off ⇒ disabled response.
  - Calls `auth.api.signOut({ headers })` (the bearer plugin turns `Authorization: Bearer` into the session, so signing out revokes that exact desktop session). Returns `200 { ok: true }` even if no session (logout is idempotent; the desktop wipes locally regardless — spec §4.10). Audits `revoke`.

(`/api/auth/sign-out` with the bearer also works — the spec allows either. This dedicated endpoint gives the desktop a stable, kill-switch-gated revoke URL.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-revoke-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const signOut = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut: (...a: unknown[]) => signOut(...a) } } }));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { POST } from "@/app/api/desktop/token/revoke/route";

beforeEach(() => {
  signOut.mockReset();
  delete process.env.DESKTOP_AUTH_ENABLED;
});

function call() {
  return POST(new Request("https://97437.dev/api/desktop/token/revoke", {
    method: "POST", headers: { authorization: "Bearer raw-bearer-xyz" },
  }));
}

describe("POST /api/desktop/token/revoke", () => {
  it("403 when the kill switch is off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    expect((await call()).status).toBe(403);
  });
  it("revokes via signOut and returns ok", async () => {
    signOut.mockResolvedValue({ success: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(signOut).toHaveBeenCalled();
  });
  it("is idempotent when signOut throws (no session)", async () => {
    signOut.mockRejectedValue(new Error("no session"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-revoke-route.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/api/desktop/token/revoke/route"`.

- [ ] **Step 3: Write the route**

```ts
// app/api/desktop/token/revoke/route.ts
import { headers } from "next/headers";
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import { auth } from "@/lib/auth";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/desktop/token/revoke — revoke the desktop session identified by the
// Authorization: Bearer header (spec §4.10). Idempotent: always 200, even with no
// session, so the desktop's local wipe is never blocked by a server error.
export async function POST(_req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();
  try {
    await auth.api.signOut({ headers: await headers() });
    auditDesktop("revoke", { ok: 1 });
  } catch {
    auditDesktop("revoke", { ok: 0 }); // best-effort; never block local logout
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
```

Note: this route reads `headers()` directly (Next 16 dynamic API) rather than the request, mirroring `lib/dal.ts`. The `_req` param is unused but kept for the route-handler signature.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/desktop-revoke-route.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add app/api/desktop/token/revoke/route.ts tests/desktop-revoke-route.test.ts
git commit -m "feat(desktop-auth): POST /api/desktop/token/revoke (idempotent bearer revoke)"
```

---

### Task 14: Device-code creation endpoint (contract wrapper)

**Files:**
- Create: `app/api/desktop/device/code/route.ts`
- Test: `tests/desktop-device-code-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`/`desktopDisabledResponse`; `auth` (`@/lib/auth`); `limitDeviceCodeCreate` (`@/lib/desktop/ratelimit`); `RateLimitError`, `retryAfterHeaders`; `auditDesktop`.
- Produces: `POST(req: Request): Promise<Response>` for `POST /api/desktop/device/code`.
  - Kill switch off ⇒ disabled response.
  - Rate-limit per IP ⇒ `429 { error: "rate_limited" }` on trip.
  - Calls `auth.api.deviceCode({ body: { client_id: "custos-desktop" } })` and returns the contract shape `{ device_code, user_code, verification_uri, expires_in, interval }` (drops `verification_uri_complete`; the desktop builds its own UX), `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-device-code-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const deviceCode = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { deviceCode: (...a: unknown[]) => deviceCode(...a) } } }));
vi.mock("@/lib/desktop/ratelimit", () => ({ limitDeviceCodeCreate: vi.fn(async () => {}) }));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { POST } from "@/app/api/desktop/device/code/route";

beforeEach(() => {
  deviceCode.mockReset();
  delete process.env.DESKTOP_AUTH_ENABLED;
});

function call() {
  return POST(new Request("https://97437.dev/api/desktop/device/code", { method: "POST" }));
}

describe("POST /api/desktop/device/code", () => {
  it("403 when off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    expect((await call()).status).toBe(403);
  });
  it("returns the RFC 8628 contract shape", async () => {
    deviceCode.mockResolvedValue({
      device_code: "DEV", user_code: "ABCD-1234",
      verification_uri: "https://97437.dev/device",
      verification_uri_complete: "https://97437.dev/device?user_code=ABCD-1234",
      expires_in: 600, interval: 5,
    });
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      device_code: "DEV", user_code: "ABCD-1234",
      verification_uri: "https://97437.dev/device", expires_in: 600, interval: 5,
    });
    expect(json.verification_uri_complete).toBeUndefined();
    const body = deviceCode.mock.calls[0][0].body;
    expect(body.client_id).toBe("custos-desktop");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-device-code-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```ts
// app/api/desktop/device/code/route.ts
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import { auth } from "@/lib/auth";
import { limitDeviceCodeCreate } from "@/lib/desktop/ratelimit";
import { RateLimitError, retryAfterHeaders } from "@/lib/ratelimit";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID = "custos-desktop";

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "unknown";
}

// POST /api/desktop/device/code — start the RFC 8628 device flow (spec §4.4).
// Thin wrapper over the device-authorization plugin returning the contract shape.
export async function POST(req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();

  try {
    await limitDeviceCodeCreate(clientIp(req));
  } catch (e) {
    if (e instanceof RateLimitError) {
      auditDesktop("rate_limited", { stage: "device_code" });
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store", ...retryAfterHeaders(e) } });
    }
    throw e;
  }

  const r = await auth.api.deviceCode({ body: { client_id: CLIENT_ID } });
  return Response.json(
    {
      device_code: r.device_code,
      user_code: r.user_code,
      verification_uri: r.verification_uri,
      expires_in: r.expires_in,
      interval: r.interval,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/desktop-device-code-route.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add app/api/desktop/device/code/route.ts tests/desktop-device-code-route.test.ts
git commit -m "feat(desktop-auth): POST /api/desktop/device/code (RFC 8628 wrapper)"
```

---

### Task 15: Device-token polling endpoint (contract wrapper + desktop re-tag)

**Files:**
- Create: `app/api/desktop/device/token/route.ts`
- Test: `tests/desktop-device-token-route.test.ts`

**Interfaces:**
- Consumes: `isDesktopAuthEnabled`/`desktopDisabledResponse`; `auth` (`@/lib/auth`); `fullUserById` (`@/lib/auth`); `mintDesktopSession`, `toPublicUser` (`@/lib/desktop/token`); `limitDeviceTokenPoll` (`@/lib/desktop/ratelimit`); `RateLimitError`; `auditDesktop`.
- Produces: `POST(req: Request): Promise<Response>` for `POST /api/desktop/device/token` body `{ device_code }`.
  - Kill switch off ⇒ disabled response.
  - Bad body ⇒ `400 { error: "invalid_request" }`.
  - `limitDeviceTokenPoll(device_code)` trip ⇒ `400 { error: "slow_down" }` (RFC 8628 uses 400 for slow_down).
  - Calls `auth.api.deviceToken({ body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code, client_id: "custos-desktop" } })`. On the plugin's `APIError`, map its `error` field to the contract codes: `authorization_pending | slow_down | expired_token | access_denied` ⇒ `400 { error }`.
  - On success the plugin returns `{ access_token }` where `access_token` is a session token — but that session is **NOT desktop-tagged**. So this route does **not** return the plugin's token. Instead it resolves the approved user (via `getSession` on the plugin token) and mints a fresh **desktop-tagged** bearer with `mintDesktopSession`, returning `200 { token, user }`. This keeps device tokens identical in scope to primary-flow tokens (spec §4.4 "same token scope").

For mapping the plugin's `APIError`: it is thrown with `.body.error` (the RFC code). Catch it, read `error`, and translate.

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-device-token-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const deviceToken = vi.fn();
const getSession = vi.fn();
const fullUserById = vi.fn();
const mintDesktopSession = vi.fn(async () => "desktop-bearer-zzz");

vi.mock("@/lib/auth", () => ({
  auth: { api: { deviceToken: (...a: unknown[]) => deviceToken(...a), getSession: (...a: unknown[]) => getSession(...a) } },
  fullUserById: (...a: unknown[]) => fullUserById(...a),
}));
vi.mock("@/lib/desktop/token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/desktop/token")>("@/lib/desktop/token");
  return { ...actual, mintDesktopSession: () => mintDesktopSession() };
});
vi.mock("@/lib/desktop/ratelimit", () => ({ limitDeviceTokenPoll: vi.fn(async () => {}) }));
vi.mock("@/lib/desktop/audit", () => ({ auditDesktop: vi.fn() }));

import { POST } from "@/app/api/desktop/device/token/route";

beforeEach(() => {
  deviceToken.mockReset(); getSession.mockReset(); fullUserById.mockReset();
  delete process.env.DESKTOP_AUTH_ENABLED;
  fullUserById.mockResolvedValue({ id: "u3", username: "dan", uid: 3, avatarVersion: 0, role: null, status: "active", image: null });
});

function post(body: unknown) {
  return POST(new Request("https://97437.dev/api/desktop/device/token", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
}

describe("POST /api/desktop/device/token", () => {
  it("403 when off", async () => {
    process.env.DESKTOP_AUTH_ENABLED = "false";
    expect((await post({ device_code: "X" })).status).toBe(403);
  });
  it("400 invalid_request on missing device_code", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });
  it("maps authorization_pending to 400", async () => {
    deviceToken.mockRejectedValue(Object.assign(new Error("pending"), { body: { error: "authorization_pending" } }));
    const res = await post({ device_code: "X" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("authorization_pending");
  });
  it("maps expired_token to 400", async () => {
    deviceToken.mockRejectedValue(Object.assign(new Error("exp"), { body: { error: "expired_token" } }));
    expect((await (await post({ device_code: "X" })).json()).error).toBe("expired_token");
  });
  it("on plugin success, re-mints a DESKTOP-tagged bearer + returns { token, user }", async () => {
    deviceToken.mockResolvedValue({ access_token: "plugin-session-token", token_type: "Bearer", expires_in: 600, scope: "" });
    getSession.mockResolvedValue({ user: { id: "u3" } });
    const res = await post({ device_code: "X" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("desktop-bearer-zzz"); // NOT the plugin token
    expect(json.user.id).toBe("u3");
    expect(mintDesktopSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-device-token-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```ts
// app/api/desktop/device/token/route.ts
import { isDesktopAuthEnabled, desktopDisabledResponse } from "@/lib/desktop/flag";
import { auth, fullUserById } from "@/lib/auth";
import { mintDesktopSession, toPublicUser } from "@/lib/desktop/token";
import { limitDeviceTokenPoll } from "@/lib/desktop/ratelimit";
import { RateLimitError } from "@/lib/ratelimit";
import { auditDesktop } from "@/lib/desktop/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLIENT_ID = "custos-desktop";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const noStore = { "Cache-Control": "no-store" };

// RFC 8628 device-token error codes we surface (all HTTP 400).
const RFC_ERRORS = new Set(["authorization_pending", "slow_down", "expired_token", "access_denied", "invalid_grant"]);

function err(code: string, status = 400): Response {
  return Response.json({ error: code }, { status, headers: noStore });
}

// POST /api/desktop/device/token { device_code } — poll for the device-flow
// result. On success, re-mint a DESKTOP-tagged bearer so device tokens have the
// exact same scope as primary-flow tokens (spec §4.4). The plugin's own session
// token is discarded.
export async function POST(req: Request): Promise<Response> {
  if (!isDesktopAuthEnabled()) return desktopDisabledResponse();

  let body: { device_code?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err("invalid_request");
  }
  const deviceCode = body.device_code;
  if (typeof deviceCode !== "string" || !deviceCode) return err("invalid_request");

  try {
    await limitDeviceTokenPoll(deviceCode);
  } catch (e) {
    if (e instanceof RateLimitError) return err("slow_down");
    throw e;
  }

  let result: { access_token: string };
  try {
    result = (await auth.api.deviceToken({
      body: { grant_type: DEVICE_GRANT, device_code: deviceCode, client_id: CLIENT_ID },
    })) as { access_token: string };
  } catch (e) {
    const code = (e as { body?: { error?: string } })?.body?.error;
    if (code && RFC_ERRORS.has(code)) {
      if (code === "access_denied") auditDesktop("device_denied", {});
      return err(code);
    }
    auditDesktop("exchange_failure", { stage: "device_token", reason: "plugin_error" });
    return err("invalid_request");
  }

  // The plugin minted a (non-desktop) session. Resolve who it is, then mint a
  // proper desktop-tagged bearer and discard the plugin token.
  const session = await auth.api
    .getSession({ headers: new Headers({ authorization: `Bearer ${result.access_token}` }) })
    .catch(() => null);
  if (!session?.user?.id) {
    auditDesktop("exchange_failure", { stage: "device_token", reason: "no_session" });
    return err("invalid_grant");
  }
  const user = await fullUserById(session.user.id);
  if (!user || user.status === "banned" || user.status === "deleted") {
    auditDesktop("banned_rejected", { stage: "device_token", userId: session.user.id });
    return err("access_denied");
  }

  const token = await mintDesktopSession(user.id);
  return Response.json({ token, user: toPublicUser(user) }, { headers: noStore });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/desktop-device-token-route.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 5: Commit**

```bash
git add app/api/desktop/device/token/route.ts tests/desktop-device-token-route.test.ts
git commit -m "feat(desktop-auth): POST /api/desktop/device/token (re-tag to desktop bearer)"
```

---

### Task 16: `/device` approval page + actions

**Files:**
- Create: `app/device/page.tsx` (server component — session-gated)
- Create: `app/device/actions.ts` (server actions)
- Test: `tests/desktop-device-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/dal`); `auth` (`@/lib/auth`); `isDesktopAuthEnabled`.
- Produces:
  - `app/device/actions.ts`: `approveDevice(formData: FormData): Promise<{ ok?: boolean; error?: string }>` and `denyDevice(formData: FormData): Promise<{ ok?: boolean; error?: string }>`. Both `"use server"`, require a web session via `getCurrentUser`, read `user_code` from the form, and call `auth.api.deviceApprove({ body: { userCode }, headers })` / `auth.api.deviceDeny(...)`. Map plugin errors to user copy.
  - `app/device/page.tsx`: a session-gated React server component. Kill switch off ⇒ a simple "Desktop sign-in is unavailable." message. No session ⇒ redirect to `/login?next=/device?...`. Otherwise renders a form (prefilled from `?user_code=`) posting to `approveDevice` / `denyDevice`.

The page itself is UI; the **tested** surface is `actions.ts` (the security-relevant logic). The page is verified manually + at build time (`next build`). Note: `getCurrentUser` rejects desktop tokens, but `/device` is opened in the **web browser** with a cookie session, so `getCurrentUser` correctly allows the real web user approving the code.

- [ ] **Step 1: Write the failing test (actions only)**

```ts
// tests/desktop-device-actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const deviceApprove = vi.fn();
const deviceDeny = vi.fn();

vi.mock("@/lib/dal", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock("@/lib/auth", () => ({ auth: { api: {
  deviceApprove: (...a: unknown[]) => deviceApprove(...a),
  deviceDeny: (...a: unknown[]) => deviceDeny(...a),
} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { approveDevice, denyDevice } from "@/app/device/actions";

function fd(code: string) {
  const f = new FormData();
  f.set("user_code", code);
  return f;
}

beforeEach(() => {
  getCurrentUser.mockReset(); deviceApprove.mockReset(); deviceDeny.mockReset();
  getCurrentUser.mockResolvedValue({ id: "u1", status: "active" });
});

describe("device approval actions", () => {
  it("approve requires a session", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await approveDevice(fd("ABCD1234"))).error).toBeTruthy();
  });
  it("approve calls the plugin and returns ok", async () => {
    deviceApprove.mockResolvedValue({ success: true });
    const r = await approveDevice(fd("ABCD1234"));
    expect(r.ok).toBe(true);
    expect(deviceApprove.mock.calls[0][0].body.userCode).toBe("ABCD1234");
  });
  it("approve maps a plugin error to copy", async () => {
    deviceApprove.mockRejectedValue(Object.assign(new Error("x"), { body: { error: "expired_token" } }));
    const r = await approveDevice(fd("ABCD1234"));
    expect(r.error).toContain("expired");
  });
  it("deny calls the plugin", async () => {
    deviceDeny.mockResolvedValue({ success: true });
    const r = await denyDevice(fd("ABCD1234"));
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-device-actions.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/device/actions"`.

- [ ] **Step 3: Write the actions**

```ts
// app/device/actions.ts
"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/dal";
import { auth } from "@/lib/auth";

type Result = { ok?: boolean; error?: string };

function copyFor(code: string | undefined): string {
  switch (code) {
    case "expired_token":
      return "That code expired. Get a new one in Custos.";
    case "invalid_request":
      return "That code isn't valid. Check it and try again.";
    case "access_denied":
      return "You can't approve this code.";
    default:
      return "Couldn't update the sign-in request. Try again.";
  }
}

async function run(
  endpoint: typeof auth.api.deviceApprove | typeof auth.api.deviceDeny,
  formData: FormData,
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in on the web first, then approve the code." };
  const userCode = String(formData.get("user_code") ?? "").trim();
  if (!userCode) return { error: "Enter the code shown in Custos." };
  try {
    await endpoint({ body: { userCode }, headers: await headers() });
    return { ok: true };
  } catch (e) {
    return { error: copyFor((e as { body?: { error?: string } })?.body?.error) };
  }
}

export async function approveDevice(formData: FormData): Promise<Result> {
  return run(auth.api.deviceApprove, formData);
}

export async function denyDevice(formData: FormData): Promise<Result> {
  return run(auth.api.deviceDeny, formData);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/desktop-device-actions.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Write the page (verified at build time, not unit-tested)**

```tsx
// app/device/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { isDesktopAuthEnabled } from "@/lib/desktop/flag";
import { approveDevice, denyDevice } from "./actions";

export const dynamic = "force-dynamic";

// Session-gated device approval page (spec §4.4). Opened in the web browser with
// a cookie session — getCurrentUser allows the real web user (desktop tokens are
// never present here). Prefilled from ?user_code= for the verification_uri_complete UX.
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string }>;
}) {
  if (!isDesktopAuthEnabled()) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-display text-h2 font-bold">Desktop sign-in is unavailable</h1>
        <p className="mt-3 text-ink-dim">You can keep using the web normally.</p>
      </main>
    );
  }

  const { user_code = "" } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(`/device?user_code=${encodeURIComponent(user_code)}`);
    redirect(`/login?next=${next}`);
  }

  return (
    <main className="mx-auto max-w-md px-5 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-scan">device sign-in</p>
      <h1 className="font-display mt-3 text-h2 font-extrabold">Approve Custos</h1>
      <p className="mt-3 text-sm text-ink-dim">
        Confirm the code shown in the Custos desktop app to finish signing in.
      </p>
      <form className="mt-8 grid gap-4">
        <label className="grid gap-2 text-sm">
          <span className="text-ink-dim">Code from Custos</span>
          <input
            name="user_code"
            defaultValue={user_code}
            autoComplete="off"
            className="rounded-xl border border-[var(--line-strong)] bg-bg px-4 py-3 font-mono tracking-widest"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            formAction={approveDevice}
            className="rounded-xl bg-scan px-5 py-3 font-display font-bold text-on-accent transition hover:-translate-y-0.5"
          >
            Approve
          </button>
          <button
            formAction={denyDevice}
            className="rounded-xl border border-[var(--line-strong)] bg-bg px-5 py-3 font-display hover:border-alert hover:text-alert"
          >
            Deny
          </button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Typecheck + build (page is verified here)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/device/page.tsx app/device/actions.ts tests/desktop-device-actions.test.ts
git commit -m "feat(desktop-auth): /device approval page + approve/deny actions"
```

---

### Task 17: Env, .env.example, STATUS.md, deploy & rollback notes

**Files:**
- Modify: `.env.example`
- Modify: `STATUS.md`
- Test: `tests/desktop-env-example.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: documented env contract (`DESKTOP_AUTH_ENABLED`, `DESKTOP_GRANT_SECRET`) + deploy checklist + rollback note. A test asserts `.env.example` documents both new vars (so a fresh clone can run the suite and deploy correctly).

- [ ] **Step 1: Write the failing test**

```ts
// tests/desktop-env-example.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envExample = readFileSync(
  fileURLToPath(new URL("../.env.example", import.meta.url)),
  "utf8",
);

describe(".env.example documents the desktop-auth contract", () => {
  it("documents DESKTOP_GRANT_SECRET", () => {
    expect(envExample).toContain("DESKTOP_GRANT_SECRET");
  });
  it("documents DESKTOP_AUTH_ENABLED", () => {
    expect(envExample).toContain("DESKTOP_AUTH_ENABLED");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/desktop-env-example.test.ts`
Expected: FAIL — neither var present.

- [ ] **Step 3: Append to `.env.example`**

Add at the end of `.env.example`:

```bash
# --- Desktop client auth (custos Electron app; spec Phase 1A) ---
# Kill switch for the whole desktop-auth subsystem. Default ON; set to "false"
# (or "0") to disable /desktop/* + /api/desktop/* end-to-end. Rollback = flip
# this. Existing web cookie login is UNAFFECTED either way.
DESKTOP_AUTH_ENABLED=true
# DEDICATED secret signing the short-lived desktop grant. MUST DIFFER from
# BETTER_AUTH_SECRET and KEEP_ACCOUNT_SECRET. Generate: openssl rand -base64 32
# Rotating it invalidates outstanding GRANTS (in-flight logins restart) but NOT
# existing desktop sessions (those are bearer tokens validated independently).
DESKTOP_GRANT_SECRET=
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/desktop-env-example.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Add a deploy + rollback section to `STATUS.md`**

Append to `STATUS.md` (after the existing gotchas section):

```markdown
## Desktop auth (Phase 1A) — deploy & rollback

New env on every Railway service that runs the web handler (web + worker if it
serves any desktop route — web only for now):
- `DESKTOP_AUTH_ENABLED` (default on; `false`/`0` disables).
- `DESKTOP_GRANT_SECRET` — `openssl rand -base64 32`, DISTINCT from
  `BETTER_AUTH_SECRET` / `KEEP_ACCOUNT_SECRET`.

Migration: a new migration adds `session.client_type` + the `deviceCode` table.
Apply with `npm run db:migrate` against the production `DATABASE_URL` before/at
deploy. No Google/GitHub console change (the existing OAuth callback URL is reused).

Rollback (spec §13): set `DESKTOP_AUTH_ENABLED=false` on Railway and redeploy —
this disables every `/desktop/*` + `/api/desktop/*` route with a clean
`desktop_auth_disabled` response. Existing web cookie login is UNAFFECTED by
enabling or rolling back desktop auth. If a deeper revert is needed, revert the
`/desktop/*` + token-exchange + device routes; the `bearer` plugin and the
`client_type` column are inert without those routes.

Do NOT merge on unit-test green alone (spec §10): run the full flow against a
local `custosweb` dev backend, then a staging/production-like Railway env first.
```

- [ ] **Step 6: Run the full suite + typecheck + lint + build (final gate)**

Run: `npx vitest run`
Expected: PASS — all desktop tests + all prior tests green.

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors; `next build` succeeds (kysely pin + no `better-auth` in `serverExternalPackages` keep this green).

- [ ] **Step 7: Commit**

```bash
git add .env.example STATUS.md tests/desktop-env-example.test.ts
git commit -m "docs(desktop-auth): env contract, deploy + rollback notes"
```

---

## Self-review: spec coverage

Mapping the spec's web-side requirements (§5 changes, §4 rules, §8 secrets, §9 codes, §10 tests, §12 Phase 1A list, §13 rollback) → tasks:

| Spec requirement | Task(s) |
|---|---|
| §4.13 / PR-2 kill switch `DESKTOP_AUTH_ENABLED` (clean disabled response; web cookie login unaffected) | 1 (util), gated in 9, 10, 11, 13, 14, 15, 16; rollback note 17 |
| §4.3 signed grant (HMAC `DESKTOP_GRANT_SECRET`, claims `userId/stateHash/codeChallenge/iat/exp~120s/jti`, "not replay-proof" wording, jti seam) | 2 (+ 410/401 split in 11) |
| §4.12 audit logging (failures only, never secrets; redaction denylist) | 3; used in 9, 10, 11, 13, 14, 15 |
| §8 secrets — `DESKTOP_GRANT_SECRET` separate, rotation semantics | 2, 17 |
| §5 schema/session tagging for scope + device storage | 4 |
| §5 Better Auth: `bearer` plugin + `trustedOrigins` + device plugin + no `serverExternalPackages` change + kysely pin | 5 (Global Constraints enforce the bans) |
| §4.5 desktop-scoped token (server-enforced scope) + `PublicUser` shape | 6 (mint + PublicUser), 7 (guard) |
| §4.5 scope rule: rejected on web-only routes, allowed on get-session | 7 + proof 12 |
| Contract item 6: `get-session` accepts `Authorization: Bearer`; banned/deleted → unauthenticated | 5 (bearer), 7 (getDesktopSession), 12 (proof) |
| §4.11 rate limits (exchange, invalid-grant tighter, device-code create, device poll) | 8; applied in 11, 14, 15 |
| §5 `GET /desktop/auth/start` (validate params, kick social sign-in carrying state/cc; existing callback unchanged) | 9 |
| §5 `GET /desktop/complete` (requires session; mint grant; `custos://` redirect; "Return to Custos" page; bounce to login) | 10 |
| §5 `POST /api/desktop/token/exchange` (verify sig/TTL/stateHash/PKCE; `{ token, user }`; error codes 400/401/410/429/403) | 11 |
| Contract item 8 / §4.10 revoke (bearer sign-out; idempotent; never blocks local logout) | 13 |
| §4.4 device fallback: `/api/desktop/device/code`, `/api/desktop/device/token` (RFC 8628 codes; bounded lifetime/interval; same scope as primary) | 14, 15 |
| §4.4 `GET /device` approval page (requires session, approve/deny user_code) | 16 |
| §8 / §11 env + `.env.example` + deploy checklist | 17 |
| §13 rollback note (flip flag; web cookie login unaffected) | 17 |
| §10 web tests (grant sign/verify incl. tamper + replay-documented-not-prevented; exchange happy+invalid; bearer scope gate; complete-requires-session; rate-limit trips; audit non-sensitive; kill switch clean) | 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 |
| §12 Phase 1A list (all of the above; no Phase 2 mixed) | All tasks; PR-3 in Global Constraints |

**Known seams / accepted limitations (called out, not gaps):**
- Grant replay-within-TTL is accepted (no `jti` store in v1). Seam marked in `lib/desktop/grant.ts` (Task 2) and tested as *documented, not prevented* (Task 2/11).
- `/desktop/complete` inline `<script>` deep-link is a progressive-enhancement fallback behind the meta-refresh + link (Task 10 note); the strict CSP may neutralize it without breaking the flow.
- The `app/layout.tsx` `getSession` call (the 2nd of 2 call sites) is display-only; it is not a privileged action, so the scope guard there is intentionally not applied (a desktop token would only ever appear there if someone sent a bearer to a page request, which the layout treats as read-only display).
- Device-token success re-mints a desktop-tagged bearer (Task 15) rather than returning the plugin's untagged session token, so device tokens are scope-identical to primary-flow tokens (§4.4).

**Placeholder scan:** every code step contains complete, runnable code using verified Better Auth `1.6.12` APIs and real `custosweb` paths/signatures. No TBD/TODO/"add error handling"/"similar to Task N".

**Type consistency:** `GrantClaims`, `PublicUser`, `DESKTOP_CLIENT_TYPE`, `signGrant`/`verifyGrant`/`verifyGrantSignature`, `mintDesktopSession`/`toPublicUser`, `getCurrentUser`/`getDesktopSession`, the `limit*` wrappers, `auditDesktop`, and `isDesktopAuthEnabled`/`desktopDisabledResponse` are named identically across every task that consumes them.
</content>
</invoke>
