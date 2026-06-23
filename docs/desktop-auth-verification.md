# Desktop Auth — Verification & Merge-Gate Checklist

Runbook for verifying and shipping the **desktop shared-login** feature (Phase 1E, Task 1E-1).

- **Spec:** [`docs/superpowers/specs/2026-06-22-custos-shared-login-design.md`](./superpowers/specs/2026-06-22-custos-shared-login-design.md) — §11 (manual Windows verification), §13 (merge & deploy rules).
- **Repos:** `custos` (Electron desktop) and `custosweb` (Next.js web/Better Auth backend).
- **Order:** run the automated gates, then deploy prerequisites, then the manual Windows flow **local → production-like**. Do **not** merge on unit-test green alone (§10/§13).

---

## 1. Automated gates (§13)

Run in **both** repos. The controller runs these; commands below are exact.

### custos (desktop)

> **NOTE:** Do **not** rely on plain `npx tsc --noEmit` — the root `tsconfig.json` **excludes the main process**, so it silently skips it. Always use `npm run typecheck`, which runs **both** the node (`tsconfig.node.json`) and web (`tsconfig.web.json`) projects.

```bash
cd custos
npm run typecheck   # tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit  (node + web)
npm run lint        # eslint .
npm test            # vitest run
npm run build       # electron-vite build
```

- [ ] `custos`: `npm run typecheck` — PASS (both node **and** web projects)
- [ ] `custos`: `npm run lint` — PASS
- [ ] `custos`: `npm test` — PASS
- [ ] `custos`: `npm run build` — PASS

### custosweb (web) — already green on its branch

```bash
cd custosweb
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
npm run build       # next build
```

- [ ] `custosweb`: `npm run typecheck` — PASS
- [ ] `custosweb`: `npm run lint` — PASS
- [ ] `custosweb`: `npm test` — PASS
- [ ] `custosweb`: `npm run build` — PASS

---

## 2. Deploy prerequisites

Complete these so the manual tests in §3 can actually run against a live backend.

- [ ] Generate `DESKTOP_GRANT_SECRET` (strong random) and set it on **Railway** (web **and** worker services).
- [ ] Run the DB migration on `custosweb`: `npm run db:migrate` (applies `0022_far_bullseye.sql` — `deviceCode` table + `session.client_type`).
- [ ] Set `DESKTOP_AUTH_ENABLED` (`true` to enable; the kill switch — leave `false` until ready).
- [ ] Redeploy `custosweb` (web + worker) after env/migration changes.
- [ ] Register / confirm the `custos://` protocol on the Windows install (installer or admin manifest — `npm run package:win:admin`).
- [ ] Confirm **NO Google/GitHub OAuth console change is needed** — the existing web OAuth callback is reused; no new redirect URI.

---

## 3. Manual Windows verification (§11)

Run on a **real Windows install** against a deployed/staging `custosweb`.

**Run the full block twice:**

1. **Local backend** — `WEB_BASE_URL=http://localhost:3000` (or bundled `resources/settings.json` `auth.webBaseUrl`), with the local custosweb dev server running. Build/install via `npm run package:win`.
2. **Production-like** — repeat against the staging/production `WEB_BASE_URL` (e.g. `https://97437.dev`) on a clean install.

| # | Check | Local | Prod-like |
|---|---|---|---|

- [ ] **Protocol** — `custos://` protocol registration works (clicking a `custos://auth/callback?...` link routes to the app via single-instance/second-instance). — local: ☐ / prod: ☐
- [ ] **Primary return** — primary-browser auto-return signs the app in (test **Google AND GitHub**). — local: ☐ / prod: ☐
- [ ] **Device-code fallback** — works when the `custos://` return is blocked: shows `user_code`, opens `/device`, polls to authed; honors `interval`/`slow_down`; stops on `denied`/`expired`. — local: ☐ / prod: ☐
- [ ] **safeStorage persist** — token persists across an app restart (still signed in). — local: ☐ / prod: ☐
- [ ] **Fail-closed** — on a box where `safeStorage.isEncryptionAvailable()` is `false`, the token is **NOT** written to disk (no plaintext), the §9 encryption-unavailable copy is shown, and re-login is required after restart. — local: ☐ / prod: ☐
- [ ] **Logout** — wipes the local token immediately (verify electron-store `auth.tokenEnc` is gone) and best-effort server revoke fires. — local: ☐ / prod: ☐
- [ ] **Ban/delete cleanup** — banned/deleted account → next startup validation **silently** wipes to anonymous (no error nag). — local: ☐ / prod: ☐
- [ ] **PR-1 (offline scanner)** — scanner works **fully with NO login and NO internet**: run a full scan, view results, export. — local: ☐ / prod: ☐
- [ ] **PR-2 (kill switch)** — with `DESKTOP_AUTH_ENABLED=false`, **no auth UI** is shown and the scanner is unaffected. — local: ☐ / prod: ☐
- [ ] **Renderer isolation** — DevTools confirms `auth:get-state` / `auth:changed` payloads contain only `{status, public user, device}` — **no** token/grant/code_verifier. — local: ☐ / prod: ☐
- [ ] **openExternal allowlist** — `openExternal` only ever opens `https://<webBase>/desktop/auth/start`, `/device`, or `/profile/id/<id>` — no arbitrary URLs. — local: ☐ / prod: ☐

---

## 4. Rollback note (§13)

Because this touches Better Auth + Railway, rollback is config-first:

- [ ] **Rollback = flip `DESKTOP_AUTH_ENABLED=false`** (and/or revert the `/desktop/*` + token-exchange routes).
- [ ] Confirm existing **web cookie login remains unaffected** by enabling or rolling back desktop auth.

---

## 5. Merge rule (§13)

- [ ] Open a **PR per repo** (`custos` and `custosweb`) — review the changed files.
- [ ] Do **NOT** direct-merge to `main` after a huge diff.
- [ ] All automated gates (§1) green in both repos.
- [ ] Manual login flow verified **local → production-like** (§3) before deployment.
- [ ] Deploy only after both PRs are merged and the prerequisites (§2) are confirmed.
