# Custos Intelligence Upgrade — Design

**Date:** 2026-06-19
**Branch:** `dev`
**Status:** Approved direction (go all-in, conservative verdict bias). Awaiting spec review.

---

## 1. Problem

Custos collects forensic traces well but does not *reason* about them. Today:

- A finding is a bare `string` (`src/shared/types.ts:5` — `findings: string[]`). No severity, confidence, category, or correlation. A coincidental filename renders identically to a known-cheat hash.
- Nothing aggregates. The same cheat name appearing in BAM **and** Prefetch **and** Amcache **and** Registry — the strongest signal in forensics — shows as four unrelated strings in four accordions. No verdict, no risk score.
- Findings are ephemeral. Only `{language, theme}` is persisted (`src/main/services/app-store.ts`). Closing the app discards every scan: no history, no rescan-diff, no case file.
- Signature data is nearly empty: `resources/hashes.json` has **0** hashes, `resources/signatures.json` AOB list is **empty**, 43 keywords total — all bundled statically, so a new cheat requires a whole new app release.
- The Results page is a read-only dump: no search, sort, filter, severity, or triage.
- Export is weak as evidence: no player identity, no timestamp in the body, no OS context, no tamper-evidence.

The engineering is strong (near-textbook Electron security, disciplined TypeScript, 251 passing tests). This work builds *up*, it does not fix.

## 2. Goal & guiding principles

Turn the collector into an **intelligence engine** wrapped in a **moderator workflow**.

- **Conservative by design.** Verdict scoring requires corroboration. A lone keyword match stays low. The product never says "guilty" — it ranks leads. This matches Custos's own "findings are leads, not proof" ethos.
- **Centralize the intelligence.** Scanners keep emitting `string[]`. A single pure engine enriches and scores. This keeps all 16 scanners untouched and puts the smarts in one unit-tested module.
- **Backward compatible at each step.** `ScanResult` keeps `findings: string[]`. New structure is additive. Typecheck + tests stay green at every phase gate.
- **No fabricated data.** We build the hash/AOB ingestion pipeline and expand keyword coverage, but real cheat hashes/AOB signatures are data the maintainer supplies (and remote updates deliver). We will not invent hashes.

### Explicit non-goals

- **No verdict-sensitivity toggle.** The user chose a fixed conservative policy, not a user-tunable one. The scoring is conservative and hardcoded.
- **Code-signing & release automation are out of build scope.** The unsigned admin binary trips SmartScreen and is worth fixing, but it requires purchasing an Authenticode certificate — a maintainer action, not a code change. Noted, not built.
- **No new scanners in this effort.** Coverage of new artifacts (SRUM, USN journal, LNK, etc.) is a separate future track. This effort makes the *existing* signal smart.

## 3. Architecture overview

```
 scanners (unchanged, emit string[])
        │  ScanResult[]
        ▼
 ┌──────────────────────┐
 │   risk-engine (pure) │  classify → correlate → score
 └──────────────────────┘
        │  ScanReport
        ├──────────────► scan-store (renderer)  → Results / verdict UI / triage
        └──────────────► history-service (main) → userData files + index → History page / diff
 signature-service (main) ──► keywords + hashes + AOB (bundled ⊕ remote, validated)
                              feeds scanners + risk-engine policy
```

The `ScanReport` is the new central artifact. It is produced once per scan by a pure function, consumed by the UI, persisted by history, and serialized by export.

## 4. Data model (`src/shared/types.ts`)

Additive. Existing `ScanResult`, `ScanProgress`, `LiveFinding` stay.

```ts
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type FindingCategory =
  | 'hash'        // known-cheat file hash (near-proof)
  | 'execution'   // evidence a keyword-named binary ran (BAM, Amcache, Prefetch)
  | 'runtime'     // currently running / loaded (process, window/module)
  | 'persistence' // scheduled tasks etc.
  | 'file'        // file/dir present on disk (appdata, gamefolder, recent)
  | 'registry'    // registry execution traces
  | 'network'     // browser history / DNS lookups of cheat infra
  | 'context'     // steam, shellbags — supporting context
  | 'environment' // VM/sandbox indicators (context only, not a cheat)

export interface AnalyzedFinding {
  id: string                 // stable: hash(scannerId + ':' + value)
  scannerId: ScannerName
  value: string              // the raw evidence string shown today
  severity: Severity         // after classification + correlation boost
  baseSeverity: Severity     // before correlation, for transparency
  category: FindingCategory
  matched: string | null     // the keyword/hash/signature that matched, if any
  correlationId: string | null  // links findings that share a signature
  dismissed?: boolean        // triage state (Phase 3), persisted
}

export interface Correlation {
  id: string
  signature: string          // the shared keyword/hash
  categories: FindingCategory[]   // distinct categories it appeared in
  scannerIds: ScannerName[]       // distinct scanners it appeared in
  strength: number                // = distinct category count
  severity: Severity              // correlation-derived severity
}

export type VerdictBand = 'clean' | 'low' | 'medium' | 'high' | 'critical'

export interface Verdict {
  score: number              // 0–100, conservative
  band: VerdictBand
  rationale: string          // one-line, English; renderer localizes via key+params
  rationaleKey?: string
  rationaleParams?: Record<string, string | number>
}

export interface ScanReportMeta {
  appVersion: string
  scannedAt: string          // ISO
  durationMs: number
  gameId: GameId | null
  os?: { name: string; version: string; arch: string; appArch: string }
  signatureVersion: string
  caseLabel?: string         // player handle / Steam ID (optional, set in UI)
  caseNote?: string
}

export interface ScanReport {
  id: string                 // stable scan id (timestamp-derived, passed in — no Date.now in pure code)
  meta: ScanReportMeta
  verdict: Verdict
  findings: AnalyzedFinding[]   // flat, all scanners, enriched + sorted by severity
  correlations: Correlation[]
  scanners: Array<{ id: ScannerName; name: string; success: boolean; error?: string; durationMs: number; count: number }>
  contentHash?: string       // SHA-256 of canonical body, for tamper-evidence (Phase 5)
}
```

## 5. The risk engine (`src/main/intel/risk-engine.ts`) — the brain

A pure module: `analyze(results: ScanResult[], ctx: AnalyzeContext): ScanReport`. No I/O, no clock (timestamps/ids passed in), fully unit-testable. `ctx` carries the keyword matcher, the scanner policy, signature version, OS/game/version meta, and the set of dismissed finding ids / whitelisted signatures.

### 5.1 Classification

For each raw finding string of each scanner:

1. **Category & base severity** from a per-scanner policy table:

| Scanner(s) | Category | Base severity | Rationale |
|---|---|---|---|
| `filehash` | hash | **critical** | a known-cheat hash is near-proof |
| `bam`, `amcache`, `prefetch` | execution | high | a keyword-named binary actually ran |
| `process`, `windowmodule` | runtime | high | running/loaded right now |
| `scheduledtasks` | persistence | high | kept alive across reboots |
| `registry` | registry | medium | execution trace, weaker than BAM |
| `appdata`, `gamefolder`, `recentfiles` | file | medium | present on disk, may be leftover |
| `browserhistory`, `dnscache` | network | medium | visited/looked-up cheat infra |
| `steam`, `shellbags` | context | low | supporting context only |
| `vm` | environment | info | environment signal, not a cheat itself |

2. **Matched signature** via `keywordMatcher.findKeyword(value)` (already returns the matched keyword, `keyword-matcher.ts:64`). Hash-scanner findings are recognized as hash matches. `matched` may be `null` (e.g. VM/context findings with no keyword) — those keep base severity and never drive a high verdict.

### 5.2 Correlation (the intelligence)

Group findings by `matched` signature. For each group spanning ≥2 **distinct categories**, create a `Correlation`. Strength = distinct category count.

- strength ≥ 3 → correlation severity **critical**, boost member findings to at least high
- strength = 2 → correlation severity **high**, boost members to at least medium-high
- strength = 1 → no boost; members keep base severity

This is what makes "undead in Prefetch + BAM + AppData" read as one high-confidence signal instead of three coincidences.

### 5.3 Verdict (conservative)

- **critical** — any `hash` finding, **or** any correlation with strength ≥ 3.
- **high** — any correlation with strength ≥ 2, **or** a runtime/execution finding whose signature also appears as a file finding.
- **medium** — multiple independent medium findings (≥ 3 distinct signatures), no corroboration.
- **low** — one or two lone medium/low findings.
- **clean** — no findings, or only `environment`/`context` with no keyword match.

Score (0–100) is a normalized weighted sum mapped onto the bands; conservative weights keep lone findings well below the high threshold. `rationale` names the driving evidence ("3 artifacts corroborate signature 'undead'").

### 5.4 Wiring

`ipc-handlers` builds the `ScanReport` after `runScan` resolves and emits it on a new `SCAN_REPORT` channel (in addition to existing per-scanner `SCAN_RESULT` events, which stay for live progress). Renderer `scan-store` holds the report; derived counts come from it.

## 6. Persistence, history & diff (`src/main/services/history-service.ts`)

electron-store is kept for settings; full reports are too large for one JSON blob, so:

- Each `ScanReport` is written to `userData/custos-history/<id>.json`.
- A compact **index** (`history-index.json`) holds `{ id, scannedAt, gameId, band, score, caseLabel, findingCount }` per scan for fast listing.
- A retention cap (default 100, configurable in Settings) prunes oldest.
- IPC: `HISTORY_LIST`, `HISTORY_GET`, `HISTORY_DELETE`, `HISTORY_CLEAR`.
- **Diff:** `diffReports(prev, next)` (pure, tested) classifies each finding id/signature as `new | resolved | unchanged`. The History/Results UI shows "N new since last scan of this case."
- **Case identity:** `caseLabel`/`caseNote` are editable on Results and saved into the report; the export and history list key off them.

New page: **History** (sidebar entry) — list of past scans with band, score, case label, date; open one to view its full report (reuses the Results renderer in read-only mode); delete; compare to another run of the same case.

## 7. Triage UI (Results redesign, `src/renderer/pages/Results.tsx`)

- **Verdict card** at top: band + score ring + one-line rationale + top correlations ("signature X corroborated across N artifacts").
- **Unified findings view:** flat, severity-sorted across all scanners. Each row: severity chip · scanner tag · category · value (mono) · copy button · dismiss/whitelist.
- **Controls:** search box (filter by value/path/signature), severity filter chips, "hits only" toggle, group-by `severity | scanner | signature`.
- **Per-scanner accordion** retained as the `scanner` grouping mode (preserves today's view).
- **Triage:** dismiss a finding or whitelist a signature; persisted (suppressed in future scans + excluded from "new" in diff). A running "X reviewed / Y open" counter.
- **a11y:** accordion becomes `<button aria-expanded>`; decorative SVGs get `aria-hidden`.

## 8. Remote-updatable signatures (`src/main/services/signature-service.ts`)

- Bundled `resources/*.json` remain the baseline.
- On launch (and on demand from Settings), fetch a signed-by-version signature bundle from a pinned GitHub raw/release URL, reusing the existing `getJson` helper (timeout + abort + Zod, `github-service.ts:32`).
- Schema gains `version` + `updatedAt`; keyword entries gain optional `severity`/`category`/`game` metadata (back-compat: plain strings still valid). Validated with Zod; a malformed/remote payload is rejected and the baseline is kept — remote data can never break scanning.
- Cache the newest valid bundle to `userData`; effective set = max(version) of bundled/cached/fetched.
- Surface "Signatures vX · updated Y" + a **Check now** button in Settings and on the Dashboard.
- Expand bundled keyword coverage; wire the hash/AOB pipeline so the maintainer (or a remote bundle) can populate `hashes.json`/`signatures.json` without an app release. **No fabricated hashes.**

## 9. Credible export (Phase 5)

Enrich `.txt` and full-`ScanReport` `.json` export:

- Header: app version, scan timestamp, OS, game, signature version, case label/player, **verdict + score**.
- Findings grouped by severity, each with scanner · category · matched signature · value.
- **Correlations** section spelled out in plain language.
- **Content hash:** SHA-256 of the canonical report body printed at the end for tamper-evidence (recompute to verify the report wasn't edited).
- Live-scan findings gain the same export path (they are component-local today, `LiveScan.tsx:27`).

## 10. Polish (Phase 6)

- Render scan errors on Scan + Results (`scan-store.error` is set but shown nowhere today).
- Keyboard: `S` = start scan, `/` = focus search, `Esc` = collapse/clear.
- First-run onboarding: brief, dismissible, explains the forensic-tool purpose + consent.
- Settings: signature update status + Check now; history retention + Clear history; export-location preference.
- Log hygiene (noted by audit): daily-file rotation/prune + redact operator username from the log header (`logger.ts:107-108`).

## 11. Phasing (each phase ends green on `dev`)

1. **Intelligence core** — data model + `risk-engine` (classify/correlate/conservative verdict, fully unit-tested) + wiring + minimal verdict UI with severity chips on existing Results.
2. **Persistence + history + diff** — `history-service`, IPC, History page, rescan-diff, case label/note.
3. **Triage UI** — Results redesign: unified severity view, search/filter/sort/group, dismiss/whitelist, a11y.
4. **Remote signatures** — `signature-service`, schema v2, version display + Check now, expanded keyword data, hash/AOB ingestion pipeline.
5. **Credible export** — structured tamper-evident `.txt`/`.json` with verdict + correlations + content hash; live-scan export.
6. **Polish** — errors rendered, keyboard, onboarding, Settings, log hygiene.

## 12. Testing strategy

- **risk-engine**: pure, table-driven unit tests — classification per scanner, correlation strength thresholds, conservative verdict boundaries (lone match stays low; 3-way corroboration → critical; hash → critical), dismissed/whitelisted suppression.
- **diffReports**: new/resolved/unchanged across report pairs.
- **history-service**: index round-trip, retention pruning, delete/clear (temp dir).
- **signature-service**: bundled fallback, version-max selection, Zod rejection of malformed remote payloads, back-compat with plain-string keyword entries.
- **export**: content-hash stability + tamper detection.
- Existing 251 tests must stay green; typecheck clean; CI (typecheck → lint → test → build) unchanged.

## 13. Risks & mitigations

- **Scope is large** → strict phasing; every phase independently shippable and green.
- **Report size / store bloat** → per-file storage + compact index + retention cap (not one electron-store blob).
- **Remote payload poisoning** → strict Zod validation + baseline fallback; remote data is never trusted to break scanning.
- **False accusations** → conservative scoring + persistent "leads, not proof" framing in verdict copy and export.
- **Pure-code determinism** (resume/test safety) → no `Date.now()`/`Math.random()` inside the engine; ids/timestamps are injected by the caller.
