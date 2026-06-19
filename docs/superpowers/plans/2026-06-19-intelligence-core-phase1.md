# Intelligence Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, unit-tested post-scan intelligence engine that turns flat finding strings into structured findings with severity + confidence, cross-scanner correlations, and one conservative, explainable risk verdict — surfaced as a verdict card and severity chips on the existing Results page.

**Architecture:** Scanners stay untouched (they keep emitting `string[]`). After `runScan` resolves, the main process calls a pure `analyze(results, ctx)` that classifies each finding (per-scanner severity policy + keyword match), correlates findings sharing a signature, and computes a conservative verdict. The resulting `ScanReport` is emitted on a new `SCAN_REPORT` IPC channel, held in the renderer scan-store, and rendered on Results. The engine is pure (ids/timestamps injected — no `Date.now()`/`Math.random()` inside) so it is fully deterministic and testable.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React 19, Zustand, Vitest (node env), i18next.

## Global Constraints

- Work only on branch `dev`. Never commit to `main`.
- Severity and confidence are **independent axes**: severity = impact-if-real (`critical|high|medium|low|info`); confidence = certainty-it's-real (`high|medium|low`). A lone match is high-severity but low-confidence.
- **Conservative verdict:** the band is only raised by high-confidence (corroborated) evidence. A lone keyword match stays `low`. Only a **verified** hash escalates to `critical` on its own; a **community** hash is capped at `medium` unless corroborated.
- **Raw scanner output is evidence, never an accusation.** Even `critical` means "investigate now," not "guilty." Engine boundary carries a code comment to this effect; UI shows a "leads, not proof" line.
- The engine is **pure**: no `Date.now()`, no `Math.random()`, no I/O. Scan id, `scannedAt`, `durationMs`, `engineVersion` and `SuppressionState` are passed in via `AnalyzeContext`.
- **Backward compatible:** `ScanResult.findings: string[]` is unchanged. All new structure is additive. Existing 251 tests must stay green; `npm run typecheck` must stay clean.
- Co-author trailers / AI attribution must NOT be added to commits (per repo convention).
- Commit message style: Conventional Commits (`feat:`, `test:`, `refactor:`), matching repo history.

**Verification at every task gate:** `npm run typecheck` (expect exit 0) and `npm test` (expect all green) before each commit.

---

### Task 1: Shared finding model + scanner display→id map

Adds the structured types the whole engine speaks, the new IPC channel, and a canonical display-name→id map (the engine receives `ScanResult.scannerName` as the English display name and must resolve it to a stable `ScannerName`).

**Files:**
- Modify: `src/shared/types.ts` (add types + `SCAN_REPORT` channel + `GameId` import)
- Create: `src/shared/scanners-meta.ts`
- Test: `src/shared/scanners-meta.test.ts`
- Modify: `src/renderer/utils/feature-i18n.ts` (re-source its map from the canonical one — DRY)

**Interfaces:**
- Produces: `Severity`, `Confidence`, `HashTrust`, `FindingCategory`, `ScoreReason`, `AnalyzedFinding`, `Correlation`, `VerdictBand`, `Verdict`, `SuppressionState`, `ScanReportMeta`, `ScanReport` (all in `src/shared/types.ts`); `IPC_CHANNELS.SCAN_REPORT`; `SCANNER_DISPLAY_TO_ID`, `scannerIdFromDisplayName(name)` (in `src/shared/scanners-meta.ts`).

- [ ] **Step 1: Add the new types to `src/shared/types.ts`**

At the top of the file, add the import (next to existing imports — `types.ts` currently has none, so add it as the first line):

```ts
import type { GameId } from './games'
```

Append this block to the end of `src/shared/types.ts` (before the final `IPC_CHANNELS` const if the const is last, otherwise at end of file — placement does not matter for types):

```ts
// ── Forensic intelligence model ──────────────────────────────────────────────
// Raw scanner output is EVIDENCE, never an accusation. Only the risk engine
// produces a graded judgement, and even 'critical' means "investigate now".

// Two independent axes: severity = impact-if-real, confidence = certainty-it's-real.
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type Confidence = 'high' | 'medium' | 'low'

// Trust level of a known-file-hash signature. Only 'verified' can drive a critical verdict alone.
export type HashTrust = 'verified' | 'community'

export type FindingCategory =
  | 'hash' | 'execution' | 'runtime' | 'persistence'
  | 'file' | 'registry' | 'network' | 'context' | 'environment'

// Explainability primitive: every severity/confidence change carries a reason.
export interface ScoreReason {
  code: string                 // e.g. 'corroboration' | 'verified-hash' | 'lone-match' | 'community-hash-uncorroborated' | 'environment-only'
  direction: 'up' | 'down' | 'neutral'
  text: string                 // English; renderer may localize via code+params later
  signature?: string
  params?: Record<string, string | number>
}

export interface AnalyzedFinding {
  id: string                   // stable: sha1(scannerId + '\n' + value), first 16 hex
  scannerId: ScannerName
  value: string
  category: FindingCategory
  matched: string | null
  hashTrust?: HashTrust
  severity: Severity           // after correlation
  baseSeverity: Severity       // before correlation
  confidence: Confidence       // after correlation
  baseConfidence: Confidence   // before correlation
  correlationId: string | null
  reasons: ScoreReason[]
  dismissed?: boolean
  whitelisted?: boolean
}

export interface Correlation {
  id: string
  signature: string
  categories: FindingCategory[]
  scannerIds: ScannerName[]
  strength: number             // distinct category count
  severity: Severity
  confidence: Confidence
}

export type VerdictBand = 'clean' | 'low' | 'medium' | 'high' | 'critical'

export interface Verdict {
  score: number                // 0–100
  band: VerdictBand
  rationale: string            // one-line summary (English)
  reasons: ScoreReason[]
}

// Triage state — defined now, persisted/surfaced in later phases. The engine
// accepts it from Phase 1 so suppression is honoured immediately.
export interface SuppressionState {
  whitelistedSignatures: string[]
  dismissedFindingIds: string[]
}

export interface ScanReportMeta {
  appVersion: string
  engineVersion: string
  scannedAt: string            // ISO
  durationMs: number
  gameId: GameId | null
  os?: { name: string; version: string; arch: string; appArch: string }
  signatureVersion: string
  caseLabel?: string
  caseNote?: string
}

export interface ScanReport {
  id: string
  meta: ScanReportMeta
  verdict: Verdict
  findings: AnalyzedFinding[]
  correlations: Correlation[]
  scanners: Array<{ id: ScannerName; name: string; success: boolean; error?: string; durationMs: number; count: number }>
  contentHash?: string
}
```

- [ ] **Step 2: Add the `SCAN_REPORT` channel**

In `src/shared/types.ts`, inside the `IPC_CHANNELS` const, in the `// Scan operations` group, add the line after `SCAN_COMPLETE`:

```ts
  SCAN_REPORT: 'scan:report',
```

- [ ] **Step 3: Write the failing test for the scanner map**

Create `src/shared/scanners-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SCANNER_DISPLAY_TO_ID, scannerIdFromDisplayName } from './scanners-meta'
import type { ScannerName } from './types'

const ALL_IDS: ScannerName[] = [
  'appdata', 'prefetch', 'recentfiles', 'gamefolder', 'registry', 'browserhistory',
  'process', 'steam', 'amcache', 'bam', 'shellbags', 'vm', 'dnscache',
  'scheduledtasks', 'filehash', 'windowmodule'
]

describe('scanners-meta', () => {
  it('maps every ScannerName id from some display name', () => {
    const mappedIds = new Set(Object.values(SCANNER_DISPLAY_TO_ID))
    for (const id of ALL_IDS) expect(mappedIds.has(id)).toBe(true)
    expect(mappedIds.size).toBe(ALL_IDS.length)
  })

  it('resolves a known display name', () => {
    expect(scannerIdFromDisplayName('File Hash Scanner')).toBe('filehash')
    expect(scannerIdFromDisplayName('BAM/DAM Scanner')).toBe('bam')
  })

  it('returns null for an unknown display name', () => {
    expect(scannerIdFromDisplayName('Nonexistent Scanner')).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/shared/scanners-meta.test.ts`
Expected: FAIL — cannot find module `./scanners-meta`.

- [ ] **Step 5: Create `src/shared/scanners-meta.ts`**

```ts
import type { ScannerName } from './types'

/**
 * Scan results identify scanners by their English display name (the IPC
 * contract). This canonical map resolves those names to the stable ids used by
 * the risk engine, capability service, and i18n keys.
 */
export const SCANNER_DISPLAY_TO_ID: Record<string, ScannerName> = {
  'AppData Scanner': 'appdata',
  'Prefetch Scanner': 'prefetch',
  'Recent Files Scanner': 'recentfiles',
  'Game Folder Scanner': 'gamefolder',
  'Registry Scanner': 'registry',
  'Browser History Scanner': 'browserhistory',
  'Process Scanner': 'process',
  'Steam Scanner': 'steam',
  'Amcache Scanner': 'amcache',
  'BAM/DAM Scanner': 'bam',
  'Shellbags Scanner': 'shellbags',
  'VM Scanner': 'vm',
  'DNS Cache Scanner': 'dnscache',
  'Scheduled Tasks Scanner': 'scheduledtasks',
  'File Hash Scanner': 'filehash',
  'Window & Module Scanner': 'windowmodule'
}

export function scannerIdFromDisplayName(name: string): ScannerName | null {
  return SCANNER_DISPLAY_TO_ID[name] ?? null
}
```

- [ ] **Step 6: Re-source the renderer map from the canonical one (DRY)**

In `src/renderer/utils/feature-i18n.ts`, replace the literal `SCANNER_NAME_TO_ID` object (the whole `export const SCANNER_NAME_TO_ID: Record<string, string> = { ... }` block) with a re-export alias:

```ts
import { SCANNER_DISPLAY_TO_ID } from '../../shared/scanners-meta'

/** @deprecated alias — use SCANNER_DISPLAY_TO_ID. Kept so existing imports compile. */
export const SCANNER_NAME_TO_ID = SCANNER_DISPLAY_TO_ID
```

Keep the existing JSDoc comment above it and leave the rest of `feature-i18n.ts` (the `featureName`/`featureDesc`/etc. functions) unchanged.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/shared/scanners-meta.test.ts` → Expected: PASS (3 tests).
Run: `npm run typecheck` → Expected: exit 0.
Run: `npm test` → Expected: all green (252 files of tests pass; new test included).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/scanners-meta.ts src/shared/scanners-meta.test.ts src/renderer/utils/feature-i18n.ts
git commit -m "feat(intel): add structured finding model, SCAN_REPORT channel, canonical scanner map"
```

---

### Task 2: Scanner severity policy table

The per-scanner classification table (category + base severity) and the engine version constant.

**Files:**
- Create: `src/main/intel/scanner-policy.ts`
- Test: `src/main/intel/scanner-policy.test.ts`

**Interfaces:**
- Consumes: `ScannerName`, `FindingCategory`, `Severity` from `src/shared/types`.
- Produces: `RISK_ENGINE_VERSION: string`, `ScannerPolicy` interface, `SCANNER_POLICY: Record<ScannerName, ScannerPolicy>`, `DEFAULT_POLICY: ScannerPolicy`.

- [ ] **Step 1: Write the failing test**

Create `src/main/intel/scanner-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SCANNER_POLICY, DEFAULT_POLICY, RISK_ENGINE_VERSION } from './scanner-policy'
import type { ScannerName } from '../../shared/types'

const ALL_IDS: ScannerName[] = [
  'appdata', 'prefetch', 'recentfiles', 'gamefolder', 'registry', 'browserhistory',
  'process', 'steam', 'amcache', 'bam', 'shellbags', 'vm', 'dnscache',
  'scheduledtasks', 'filehash', 'windowmodule'
]

describe('scanner-policy', () => {
  it('has a policy entry for every scanner', () => {
    for (const id of ALL_IDS) expect(SCANNER_POLICY[id]).toBeDefined()
  })

  it('classifies high-signal scanners correctly', () => {
    expect(SCANNER_POLICY.filehash).toEqual({ category: 'hash', baseSeverity: 'critical' })
    expect(SCANNER_POLICY.bam).toEqual({ category: 'execution', baseSeverity: 'high' })
    expect(SCANNER_POLICY.process).toEqual({ category: 'runtime', baseSeverity: 'high' })
    expect(SCANNER_POLICY.scheduledtasks).toEqual({ category: 'persistence', baseSeverity: 'high' })
  })

  it('classifies low-signal scanners as context/environment', () => {
    expect(SCANNER_POLICY.steam).toEqual({ category: 'context', baseSeverity: 'low' })
    expect(SCANNER_POLICY.vm).toEqual({ category: 'environment', baseSeverity: 'info' })
  })

  it('exposes a default policy and an engine version', () => {
    expect(DEFAULT_POLICY).toEqual({ category: 'context', baseSeverity: 'low' })
    expect(RISK_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/scanner-policy.test.ts`
Expected: FAIL — cannot find module `./scanner-policy`.

- [ ] **Step 3: Create `src/main/intel/scanner-policy.ts`**

```ts
import type { ScannerName, FindingCategory, Severity } from '../../shared/types'

/** Bump when scoring logic changes, so history/diff stays comparable across versions. */
export const RISK_ENGINE_VERSION = '1.0.0'

export interface ScannerPolicy {
  category: FindingCategory
  baseSeverity: Severity
}

/** Category + base severity (impact-if-real) per scanner. Confidence is earned separately. */
export const SCANNER_POLICY: Record<ScannerName, ScannerPolicy> = {
  filehash: { category: 'hash', baseSeverity: 'critical' },
  bam: { category: 'execution', baseSeverity: 'high' },
  amcache: { category: 'execution', baseSeverity: 'high' },
  prefetch: { category: 'execution', baseSeverity: 'high' },
  process: { category: 'runtime', baseSeverity: 'high' },
  windowmodule: { category: 'runtime', baseSeverity: 'high' },
  scheduledtasks: { category: 'persistence', baseSeverity: 'high' },
  registry: { category: 'registry', baseSeverity: 'medium' },
  appdata: { category: 'file', baseSeverity: 'medium' },
  gamefolder: { category: 'file', baseSeverity: 'medium' },
  recentfiles: { category: 'file', baseSeverity: 'medium' },
  browserhistory: { category: 'network', baseSeverity: 'medium' },
  dnscache: { category: 'network', baseSeverity: 'medium' },
  steam: { category: 'context', baseSeverity: 'low' },
  shellbags: { category: 'context', baseSeverity: 'low' },
  vm: { category: 'environment', baseSeverity: 'info' }
}

/** Used when a scanner display name cannot be resolved (defensive; should not occur). */
export const DEFAULT_POLICY: ScannerPolicy = { category: 'context', baseSeverity: 'low' }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/scanner-policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/intel/scanner-policy.ts src/main/intel/scanner-policy.test.ts
git commit -m "feat(intel): add per-scanner severity/category policy table"
```

---

### Task 3: Classification — `classifyFindings`

Turns each raw finding string into an `AnalyzedFinding` with category, base severity, base confidence, matched signature, and a stable id. Lives in the engine module; later tasks add `correlate`, `computeVerdict`, and `analyze` to the same file.

**Files:**
- Create: `src/main/intel/risk-engine.ts`
- Test: `src/main/intel/risk-engine.test.ts`

**Interfaces:**
- Consumes: `SCANNER_POLICY`, `DEFAULT_POLICY` (Task 2); `scannerIdFromDisplayName` (Task 1); `ScanResult`, `AnalyzedFinding`, `HashTrust`, `Confidence` from shared types.
- Produces: `classifyFindings(results: ScanResult[], findKeyword: (value: string) => string | null): AnalyzedFinding[]`; internal `findingId(scannerId, value)` helper (not exported).

- [ ] **Step 1: Write the failing test**

Create `src/main/intel/risk-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classifyFindings } from './risk-engine'
import type { ScanResult } from '../../shared/types'

function result(scannerName: string, findings: string[], success = true): ScanResult {
  const now = new Date(0)
  return { scannerName, success, findings, startTime: now, endTime: now, duration: 1, count: findings.length, hasFindings: findings.length > 0 }
}

// keyword matcher stub: a finding "matches" a signature if it contains it (case-insensitive)
const SIGS = ['undead', 'aimbot']
const findKeyword = (v: string): string | null =>
  SIGS.find(s => v.toLowerCase().includes(s)) ?? null

describe('classifyFindings', () => {
  it('classifies a lone keyword file match as medium severity / LOW confidence', () => {
    const out = classifyFindings([result('AppData Scanner', ['C:/x/undead.exe'])], findKeyword)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      scannerId: 'appdata', category: 'file', matched: 'undead',
      baseSeverity: 'medium', severity: 'medium',
      baseConfidence: 'low', confidence: 'low'
    })
    expect(out[0].id).toMatch(/^[0-9a-f]{16}$/)
  })

  it('treats a file-hash finding as a verified hash: critical severity, high confidence', () => {
    const out = classifyFindings([result('File Hash Scanner', ['deadbeef  C:/d/cheat.exe'])], findKeyword)
    expect(out[0]).toMatchObject({
      scannerId: 'filehash', category: 'hash', hashTrust: 'verified',
      baseSeverity: 'critical', baseConfidence: 'high', matched: 'deadbeef  C:/d/cheat.exe'
    })
  })

  it('keeps matched=null for findings with no keyword (e.g. VM)', () => {
    const out = classifyFindings([result('VM Scanner', ['VMware adapter detected'])], findKeyword)
    expect(out[0]).toMatchObject({ scannerId: 'vm', category: 'environment', baseSeverity: 'info', matched: null })
  })

  it('skips failed scanner results', () => {
    expect(classifyFindings([result('AppData Scanner', [], false)], findKeyword)).toEqual([])
  })

  it('produces stable ids for identical (scanner,value)', () => {
    const a = classifyFindings([result('AppData Scanner', ['undead'])], findKeyword)
    const b = classifyFindings([result('AppData Scanner', ['undead'])], findKeyword)
    expect(a[0].id).toBe(b[0].id)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: FAIL — cannot find module `./risk-engine`.

- [ ] **Step 3: Create `src/main/intel/risk-engine.ts` with `classifyFindings`**

```ts
import { createHash } from 'crypto'
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence
} from '../../shared/types'
import { scannerIdFromDisplayName } from '../../shared/scanners-meta'
import { SCANNER_POLICY, DEFAULT_POLICY } from './scanner-policy'

function findingId(scannerId: string, value: string): string {
  return createHash('sha1').update(`${scannerId}\n${value}`).digest('hex').slice(0, 16)
}

/**
 * Classify raw scanner output into structured findings. A finding string is only
 * EVIDENCE — base severity comes from the scanner's policy, base confidence
 * starts LOW (a name match is a coincidence until corroborated). A file-hash
 * finding is the exception: it is a content match, so it starts high-confidence.
 */
export function classifyFindings(
  results: ScanResult[],
  findKeyword: (value: string) => string | null
): AnalyzedFinding[] {
  const out: AnalyzedFinding[] = []
  for (const r of results) {
    if (!r.success) continue
    const scannerId = scannerIdFromDisplayName(r.scannerName)
    if (!scannerId) continue // defensive: unknown display name (should not occur)
    const policy = SCANNER_POLICY[scannerId] ?? DEFAULT_POLICY
    const isHash = policy.category === 'hash'
    for (const value of r.findings) {
      const hashTrust: HashTrust | undefined = isHash ? 'verified' : undefined
      const matched = isHash ? value : findKeyword(value)
      const baseConfidence: Confidence = isHash ? 'high' : 'low'
      out.push({
        id: findingId(scannerId, value),
        scannerId,
        value,
        category: policy.category,
        matched: matched ?? null,
        hashTrust,
        severity: policy.baseSeverity,
        baseSeverity: policy.baseSeverity,
        confidence: baseConfidence,
        baseConfidence,
        correlationId: null,
        reasons: []
      })
    }
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/intel/risk-engine.ts src/main/intel/risk-engine.test.ts
git commit -m "feat(intel): classify scanner output into structured findings"
```

---

### Task 4: Correlation — `correlate`

Groups findings sharing a signature across distinct categories, raising confidence (the conservative bias: confidence is earned by corroboration). Records a `ScoreReason` on each boosted finding.

**Files:**
- Modify: `src/main/intel/risk-engine.ts` (add `correlate` + rank helpers)
- Test: `src/main/intel/risk-engine.test.ts` (add a `describe('correlate')` block)

**Interfaces:**
- Consumes: `AnalyzedFinding`, `Correlation`, `Severity`, `Confidence` from shared types.
- Produces: `correlate(findings: AnalyzedFinding[]): { findings: AnalyzedFinding[]; correlations: Correlation[] }`; exported rank helpers `severityRank(s)`, `confidenceRank(c)`.

- [ ] **Step 1: Write the failing test (append to `risk-engine.test.ts`)**

Add these imports to the existing import line from `./risk-engine`:

```ts
import { classifyFindings, correlate } from './risk-engine'
```

Add a new block at the end of the file:

```ts
describe('correlate', () => {
  // Build classified findings for one signature spread across N scanners/categories.
  function findingsFor(signature: string, scanners: string[]) {
    return classifyFindings(
      scanners.map(s => result(s, [`x ${signature} y`])),
      () => signature
    )
  }

  it('does not correlate a signature confined to one category', () => {
    // appdata + recentfiles are both category 'file' → single category, no correlation
    const { correlations, findings } = correlate(findingsFor('undead', ['AppData Scanner', 'Recent Files Scanner']))
    expect(correlations).toHaveLength(0)
    expect(findings.every(f => f.confidence === 'low')).toBe(true)
  })

  it('correlates across 2 distinct categories → medium confidence', () => {
    const { correlations, findings } = correlate(findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner']))
    expect(correlations).toHaveLength(1)
    expect(correlations[0].strength).toBe(2)
    expect(correlations[0].confidence).toBe('medium')
    expect(findings.every(f => f.confidence === 'medium')).toBe(true)
    expect(findings.every(f => f.reasons.some(r => r.code === 'corroboration'))).toBe(true)
  })

  it('correlates across 3+ distinct categories → high confidence and ≥ high severity', () => {
    const { correlations, findings } = correlate(
      findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner', 'DNS Cache Scanner'])
    )
    expect(correlations[0].strength).toBe(3)
    expect(correlations[0].confidence).toBe('high')
    expect(findings.every(f => f.confidence === 'high')).toBe(true)
    expect(findings.every(f => f.severity === 'high' || f.severity === 'critical')).toBe(true)
  })

  it('does not mutate the input array elements', () => {
    const input = findingsFor('undead', ['AppData Scanner', 'BAM/DAM Scanner'])
    correlate(input)
    expect(input.every(f => f.confidence === 'low')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: FAIL — `correlate` is not exported / not a function.

- [ ] **Step 3: Add `correlate` and rank helpers to `src/main/intel/risk-engine.ts`**

Add to the imports at the top (extend the existing shared-types import):

```ts
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence, Correlation, Severity, ScoreReason
} from '../../shared/types'
```

Append to the file:

```ts
const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 }

export function severityRank(s: Severity): number { return SEVERITY_RANK[s] }
export function confidenceRank(c: Confidence): number { return CONFIDENCE_RANK[c] }

function maxSeverity(a: Severity, b: Severity): Severity { return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b }
function maxConfidence(a: Confidence, b: Confidence): Confidence { return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b }

function correlationId(signature: string): string {
  return 'corr-' + createHash('sha1').update(signature.toLowerCase()).digest('hex').slice(0, 8)
}

/**
 * Confidence is EARNED by corroboration. Findings sharing a signature across ≥2
 * distinct categories form a Correlation; strength = distinct category count.
 * strength 2 → medium confidence; strength ≥3 → high confidence + ≥high severity.
 * Operates on copies — the input array's elements are not mutated.
 */
export function correlate(
  input: AnalyzedFinding[]
): { findings: AnalyzedFinding[]; correlations: Correlation[] } {
  const findings = input.map(f => ({ ...f, reasons: [...f.reasons] }))
  const groups = new Map<string, AnalyzedFinding[]>()
  for (const f of findings) {
    if (!f.matched) continue
    const key = f.matched.toLowerCase()
    const arr = groups.get(key)
    if (arr) arr.push(f)
    else groups.set(key, [f])
  }

  const correlations: Correlation[] = []
  for (const members of groups.values()) {
    const categories = [...new Set(members.map(m => m.category))]
    if (categories.length < 2) continue
    const strength = categories.length
    const confidence: Confidence = strength >= 3 ? 'high' : 'medium'
    const severity: Severity = strength >= 3 ? 'high' : 'medium'
    const corr: Correlation = {
      id: correlationId(members[0].matched!),
      signature: members[0].matched!,
      categories,
      scannerIds: [...new Set(members.map(m => m.scannerId))],
      strength,
      severity,
      confidence
    }
    correlations.push(corr)
    for (const m of members) {
      const newSeverity = maxSeverity(m.severity, severity)
      const newConfidence = maxConfidence(m.confidence, confidence)
      if (newSeverity !== m.severity || newConfidence !== m.confidence) {
        m.reasons.push({
          code: 'corroboration',
          direction: 'up',
          text: `Corroborated across ${categories.join(', ')}`,
          signature: corr.signature,
          params: { categories: categories.join(', '), strength }
        })
      }
      m.correlationId = corr.id
      m.severity = newSeverity
      m.confidence = newConfidence
    }
  }
  return { findings, correlations }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/main/intel/risk-engine.ts src/main/intel/risk-engine.test.ts
git commit -m "feat(intel): correlate findings across artifacts to earn confidence"
```

---

### Task 5: Verdict — `computeVerdict`

The conservative, explainable verdict. Inputs are the **active** (non-suppressed) findings and correlations; only high-confidence evidence raises the band.

**Files:**
- Modify: `src/main/intel/risk-engine.ts` (add `computeVerdict`)
- Test: `src/main/intel/risk-engine.test.ts` (add a `describe('computeVerdict')` block)

**Interfaces:**
- Consumes: `AnalyzedFinding`, `Correlation`, `Verdict`, `VerdictBand`, `ScoreReason` from shared types; `severityRank` (Task 4).
- Produces: `computeVerdict(findings: AnalyzedFinding[], correlations: Correlation[]): Verdict`. Inputs are assumed already filtered to active (non-dismissed, non-whitelisted) findings.

- [ ] **Step 1: Write the failing test (append to `risk-engine.test.ts`)**

Extend the `./risk-engine` import to add `computeVerdict`:

```ts
import { classifyFindings, correlate, computeVerdict } from './risk-engine'
```

Append a new block:

```ts
describe('computeVerdict (conservative)', () => {
  function analyzed(scanners: string[], signature: string) {
    return correlate(classifyFindings(scanners.map(s => result(s, [`a ${signature} b`])), () => signature))
  }

  it('clean when there are no findings', () => {
    expect(computeVerdict([], []).band).toBe('clean')
  })

  it('clean when only environment/context findings with no keyword', () => {
    const f = classifyFindings([result('VM Scanner', ['VMware detected'])], () => null)
    expect(computeVerdict(f, []).band).toBe('clean')
  })

  it('low for one or two lone medium findings', () => {
    const f = classifyFindings([result('AppData Scanner', ['undead.exe'])], () => 'undead')
    expect(computeVerdict(f, []).band).toBe('low')
  })

  it('medium for 3+ distinct uncorroborated signatures', () => {
    const f = classifyFindings([
      result('AppData Scanner', ['a.exe']),
      result('Recent Files Scanner', ['b.exe']),
      result('Game Folder Scanner', ['c.exe'])
    ], (v) => v) // each value is its own signature; all category 'file' → no correlation
    expect(computeVerdict(f, []).band).toBe('medium')
  })

  it('high when a signature is corroborated across 2 categories', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner'], 'undead')
    const v = computeVerdict(findings, correlations)
    expect(v.band).toBe('high')
    expect(v.reasons.some(r => r.code === 'corroboration')).toBe(true)
  })

  it('critical when a signature is corroborated across 3+ categories', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner', 'DNS Cache Scanner'], 'undead')
    expect(computeVerdict(findings, correlations).band).toBe('critical')
  })

  it('critical for a verified hash on its own', () => {
    const f = classifyFindings([result('File Hash Scanner', ['deadbeef cheat.exe'])], () => null)
    const v = computeVerdict(f, [])
    expect(v.band).toBe('critical')
    expect(v.reasons.some(r => r.code === 'verified-hash')).toBe(true)
  })

  it('caps a community hash at medium when uncorroborated', () => {
    const f = classifyFindings([result('File Hash Scanner', ['deadbeef cheat.exe'])], () => null)
    f[0].hashTrust = 'community'
    f[0].confidence = 'medium'
    f[0].baseConfidence = 'medium'
    expect(computeVerdict(f, []).band).toBe('medium')
  })

  it('always assigns a numeric score and a one-line rationale', () => {
    const { findings, correlations } = analyzed(['AppData Scanner', 'BAM/DAM Scanner'], 'undead')
    const v = computeVerdict(findings, correlations)
    expect(typeof v.score).toBe('number')
    expect(v.score).toBeGreaterThan(0)
    expect(v.rationale.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: FAIL — `computeVerdict` is not exported.

- [ ] **Step 3: Add `computeVerdict` to `src/main/intel/risk-engine.ts`**

Extend the shared-types import to include `Verdict` and `VerdictBand`:

```ts
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence, Correlation, Severity, ScoreReason, Verdict, VerdictBand
} from '../../shared/types'
```

Append to the file:

```ts
const BAND_SCORE: Record<VerdictBand, number> = { clean: 0, low: 25, medium: 50, high: 72, critical: 92 }

/**
 * Conservative verdict: the band is raised ONLY by high-confidence (corroborated)
 * evidence. A lone match stays low. A verified hash escalates to critical alone;
 * a community hash is capped at medium unless other corroborating evidence exists.
 * `findings`/`correlations` are assumed already filtered to ACTIVE (non-suppressed).
 */
export function computeVerdict(findings: AnalyzedFinding[], correlations: Correlation[]): Verdict {
  const reasons: ScoreReason[] = []

  if (findings.length === 0) {
    return { score: 0, band: 'clean', rationale: 'No findings', reasons }
  }

  const hasVerifiedHash = findings.some(f => f.category === 'hash' && f.hashTrust === 'verified')
  const communityHashes = findings.filter(f => f.category === 'hash' && f.hashTrust === 'community')
  const strong3 = correlations.some(c => c.strength >= 3)
  const strong2 = correlations.some(c => c.strength >= 2)

  // A runtime/execution signature that also appears as a file finding.
  const fileSigs = new Set(findings.filter(f => f.category === 'file' && f.matched).map(f => f.matched!.toLowerCase()))
  const crossRuntimeFile = findings.some(
    f => (f.category === 'runtime' || f.category === 'execution') && f.matched && fileSigs.has(f.matched.toLowerCase())
  )
  // A community hash plus any other independent medium+ evidence.
  const communityHashCorroborated =
    communityHashes.length > 0 && findings.some(f => f.category !== 'hash' && severityRank(f.severity) >= 2)

  const distinctMediumSignatures = new Set(
    findings.filter(f => severityRank(f.baseSeverity) >= 2 && f.matched).map(f => f.matched!.toLowerCase())
  ).size

  const hasMeaningful = findings.some(f => severityRank(f.baseSeverity) >= 1) // exclude pure 'info'

  let band: VerdictBand
  if (hasVerifiedHash) {
    band = 'critical'
    reasons.push({ code: 'verified-hash', direction: 'up', text: 'A verified known-cheat file hash matched' })
  } else if (strong3) {
    band = 'critical'
    reasons.push({ code: 'corroboration', direction: 'up', text: 'A signature was corroborated across 3+ artifact types' })
  } else if (strong2 || crossRuntimeFile || communityHashCorroborated) {
    band = 'high'
    reasons.push({ code: 'corroboration', direction: 'up', text: 'A signature was corroborated across multiple artifacts' })
  } else if (communityHashes.length > 0 || distinctMediumSignatures >= 3) {
    band = 'medium'
    reasons.push(communityHashes.length > 0
      ? { code: 'community-hash-uncorroborated', direction: 'neutral', text: 'An unverified (community) hash matched but is not corroborated' }
      : { code: 'multiple-leads', direction: 'neutral', text: 'Several independent leads, none corroborated' })
  } else if (hasMeaningful) {
    band = 'low'
    reasons.push({ code: 'lone-match', direction: 'neutral', text: 'An isolated keyword match — likely a coincidence until corroborated' })
  } else {
    band = 'clean'
    reasons.push({ code: 'environment-only', direction: 'neutral', text: 'Only environment/context signals, no cheat evidence' })
  }

  return { score: BAND_SCORE[band], band, rationale: reasons[0].text, reasons }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: PASS (19 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/main/intel/risk-engine.ts src/main/intel/risk-engine.test.ts
git commit -m "feat(intel): conservative, explainable risk verdict"
```

---

### Task 6: Orchestrator — `analyze` + `AnalyzeContext` + suppression

Ties classify → correlate → suppression → verdict into a single pure `analyze` that returns a complete `ScanReport`. Honours `SuppressionState` from day one (whitelisted signatures + dismissed ids are flagged and excluded from the verdict, but still present in the finding list).

**Files:**
- Modify: `src/main/intel/risk-engine.ts` (add `AnalyzeContext` + `analyze`)
- Test: `src/main/intel/risk-engine.test.ts` (add a `describe('analyze')` block)

**Interfaces:**
- Consumes: `classifyFindings`, `correlate`, `computeVerdict`, `severityRank`, `confidenceRank`, `RISK_ENGINE_VERSION`; `ScanReport`, `SuppressionState`, `GameId`, `OsInfo`-subset from shared types.
- Produces: `AnalyzeContext` interface; `analyze(results: ScanResult[], ctx: AnalyzeContext): ScanReport`.

- [ ] **Step 1: Write the failing test (append to `risk-engine.test.ts`)**

Extend the `./risk-engine` import to add `analyze`:

```ts
import { classifyFindings, correlate, computeVerdict, analyze } from './risk-engine'
import type { AnalyzeContext } from './risk-engine'
```

Append:

```ts
describe('analyze', () => {
  const baseCtx: AnalyzeContext = {
    scanId: 'scan-1',
    scannedAt: '2026-06-19T00:00:00.000Z',
    durationMs: 1234,
    appVersion: '3.0.0',
    signatureVersion: 'bundled-1',
    gameId: 'unturned',
    os: { name: 'Windows 11', version: '11 24H2', arch: 'x64', appArch: 'x64' },
    findKeyword: (v: string) => (v.toLowerCase().includes('undead') ? 'undead' : null),
    suppression: { whitelistedSignatures: [], dismissedFindingIds: [] }
  }

  it('produces a full report with stamped meta', () => {
    const report = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    expect(report.id).toBe('scan-1')
    expect(report.meta.engineVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(report.meta.signatureVersion).toBe('bundled-1')
    expect(report.meta.gameId).toBe('unturned')
    expect(report.findings).toHaveLength(1)
    expect(report.scanners[0]).toMatchObject({ id: 'appdata', success: true, count: 1 })
  })

  it('sorts findings by severity then confidence (most serious first)', () => {
    const report = analyze([
      result('VM Scanner', ['vmware']),
      result('File Hash Scanner', ['deadbeef cheat.exe'])
    ], baseCtx)
    expect(report.findings[0].category).toBe('hash')
  })

  it('whitelisted signature is flagged and excluded from the verdict', () => {
    const ctx = { ...baseCtx, suppression: { whitelistedSignatures: ['undead'], dismissedFindingIds: [] } }
    const report = analyze([
      result('AppData Scanner', ['undead.exe']),
      result('BAM/DAM Scanner', ['ran undead'])
    ], ctx)
    expect(report.findings.every(f => f.whitelisted)).toBe(true)
    expect(report.verdict.band).toBe('clean') // the only evidence was whitelisted
  })

  it('dismissed finding id is flagged and excluded from the verdict', () => {
    const first = analyze([result('File Hash Scanner', ['deadbeef cheat.exe'])], baseCtx)
    const dismissedId = first.findings[0].id
    const ctx = { ...baseCtx, suppression: { whitelistedSignatures: [], dismissedFindingIds: [dismissedId] } }
    const report = analyze([result('File Hash Scanner', ['deadbeef cheat.exe'])], ctx)
    expect(report.findings[0].dismissed).toBe(true)
    expect(report.verdict.band).toBe('clean')
  })

  it('is deterministic — identical input yields identical output', () => {
    const a = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    const b = analyze([result('AppData Scanner', ['undead.exe'])], baseCtx)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: FAIL — `analyze` / `AnalyzeContext` not exported.

- [ ] **Step 3: Add `AnalyzeContext` and `analyze` to `src/main/intel/risk-engine.ts`**

Extend the shared-types import to add `ScanReport` and `SuppressionState`, and add a `GameId` import:

```ts
import type {
  ScanResult, AnalyzedFinding, HashTrust, Confidence, Correlation, Severity, ScoreReason,
  Verdict, VerdictBand, ScanReport, SuppressionState, ScannerName
} from '../../shared/types'
import type { GameId } from '../../shared/games'
```

Add the `RISK_ENGINE_VERSION` import from the policy module (top of file, with the other local import):

```ts
import { SCANNER_POLICY, DEFAULT_POLICY, RISK_ENGINE_VERSION } from './scanner-policy'
```

Append to the file:

```ts
export interface AnalyzeContext {
  scanId: string
  scannedAt: string            // ISO
  durationMs: number
  appVersion: string
  signatureVersion: string
  gameId: GameId | null
  os?: { name: string; version: string; arch: string; appArch: string }
  findKeyword: (value: string) => string | null
  suppression: SuppressionState
}

function sortFindings(findings: AnalyzedFinding[]): AnalyzedFinding[] {
  return [...findings].sort((a, b) =>
    severityRank(b.severity) - severityRank(a.severity) ||
    confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
    a.scannerId.localeCompare(b.scannerId) ||
    a.value.localeCompare(b.value)
  )
}

/** Pure end-to-end analysis: classify → correlate → suppress → verdict → report. */
export function analyze(results: ScanResult[], ctx: AnalyzeContext): ScanReport {
  const classified = classifyFindings(results, ctx.findKeyword)
  const { findings, correlations } = correlate(classified)

  const whitelist = new Set(ctx.suppression.whitelistedSignatures.map(s => s.toLowerCase()))
  const dismissed = new Set(ctx.suppression.dismissedFindingIds)
  for (const f of findings) {
    if (f.matched && whitelist.has(f.matched.toLowerCase())) f.whitelisted = true
    if (dismissed.has(f.id)) f.dismissed = true
  }

  const active = findings.filter(f => !f.whitelisted && !f.dismissed)
  const activeCorrelations = correlations.filter(c => active.some(f => f.correlationId === c.id))
  const verdict = computeVerdict(active, activeCorrelations)

  const scanners = results.map(r => ({
    id: (scannerIdFromDisplayName(r.scannerName) ?? (r.scannerName as ScannerName)),
    name: r.scannerName,
    success: r.success,
    error: r.error,
    durationMs: r.duration,
    count: r.findings.length
  }))

  return {
    id: ctx.scanId,
    meta: {
      appVersion: ctx.appVersion,
      engineVersion: RISK_ENGINE_VERSION,
      scannedAt: ctx.scannedAt,
      durationMs: ctx.durationMs,
      gameId: ctx.gameId,
      os: ctx.os,
      signatureVersion: ctx.signatureVersion
    },
    verdict,
    findings: sortFindings(findings),
    correlations,
    scanners
  }
}
```

Note: `scannerIdFromDisplayName` is already imported at the top of the file (Task 3). Do not duplicate the import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/risk-engine.test.ts`
Expected: PASS (24 tests total).

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm run typecheck` → exit 0.
Run: `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/intel/risk-engine.ts src/main/intel/risk-engine.test.ts
git commit -m "feat(intel): analyze() orchestrator with suppression + report assembly"
```

---

### Task 7: Wire the engine into the scan IPC flow

Build a `ScanReport` after each scan and emit it on `SCAN_REPORT`. The impure inputs (clock, OS info, app version, keyword matcher) are gathered in the handler; the engine stays pure. A small pure helper module carries the only testable logic.

**Files:**
- Create: `src/main/intel/report-context.ts`
- Test: `src/main/intel/report-context.test.ts`
- Modify: `src/main/scanners/index.ts` (expose the keyword matcher)
- Modify: `src/main/ipc-handlers.ts` (build + emit the report)

**Interfaces:**
- Consumes: `analyze`, `AnalyzeContext` (Task 6); `OsInfo`, `IPC_CHANNELS`, `ScanResult` from shared types; `KeywordMatcher`.
- Produces: `osMetaFromOsInfo(os)`, `makeScanId(epochMs)` (in `report-context.ts`); `ScannerFactory.getKeywordMatcher(): KeywordMatcher`.

- [ ] **Step 1: Write the failing test for the helper**

Create `src/main/intel/report-context.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { osMetaFromOsInfo, makeScanId } from './report-context'
import type { OsInfo } from '../../shared/types'

const os: OsInfo = {
  platform: 'windows', major: 11, minor: 0, build: 26100,
  name: 'Windows 11', edition: '24H2', version: '11 24H2',
  displayName: 'WINDOWS 11 24H2 · 26100 · X64',
  isWindows11: true, arch: 'x64', appArch: 'x64', isEmulated: false
}

describe('report-context', () => {
  it('projects OsInfo to the report meta subset', () => {
    expect(osMetaFromOsInfo(os)).toEqual({ name: 'Windows 11', version: '11 24H2', arch: 'x64', appArch: 'x64' })
  })

  it('builds a stable scan id from an epoch', () => {
    expect(makeScanId(1750000000000)).toBe('scan-1750000000000')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/intel/report-context.test.ts`
Expected: FAIL — cannot find module `./report-context`.

- [ ] **Step 3: Create `src/main/intel/report-context.ts`**

```ts
import type { OsInfo } from '../../shared/types'

export function osMetaFromOsInfo(os: OsInfo): { name: string; version: string; arch: string; appArch: string } {
  return { name: os.name, version: os.version, arch: os.arch, appArch: os.appArch }
}

export function makeScanId(epochMs: number): string {
  return `scan-${epochMs}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/intel/report-context.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Expose the keyword matcher on the factory**

In `src/main/scanners/index.ts`, add this method to the `ScannerFactory` class (e.g. right after `getScanner`):

```ts
  getKeywordMatcher(): KeywordMatcher {
    return this.keywordMatcher
  }
```

`KeywordMatcher` is already imported at the top of that file — no new import needed.

- [ ] **Step 6: Build + emit the report in the SCAN_START handler**

In `src/main/ipc-handlers.ts`, add these imports near the existing imports (match the existing import grouping):

```ts
import { analyze } from './intel/risk-engine'
import { osMetaFromOsInfo, makeScanId } from './intel/report-context'
```

Add a module-level constant near the top of the handler-registration function (next to `SCANNER_TIMEOUT_MS`):

```ts
  // Static for Phase 1; the signature-service supplies a real version in a later phase.
  const SIGNATURE_VERSION = 'bundled-1'
```

Then, inside the `IPC_CHANNELS.SCAN_START` handler, locate the block:

```ts
        safeSend(IPC_CHANNELS.SCAN_COMPLETE, results)
        return results
```

Replace it with:

```ts
        const report = analyze(results, {
          scanId: makeScanId(scanStartedAt),
          scannedAt: new Date(scanStartedAt).toISOString(),
          durationMs: Date.now() - scanStartedAt,
          appVersion: app.getVersion(),
          signatureVersion: SIGNATURE_VERSION,
          gameId: null,
          os: osMetaFromOsInfo(getOsInfo()),
          findKeyword: (value: string) => scannerFactory.getKeywordMatcher().findKeyword(value),
          suppression: { whitelistedSignatures: [], dismissedFindingIds: [] }
        })
        safeSend(IPC_CHANNELS.SCAN_REPORT, report)
        safeSend(IPC_CHANNELS.SCAN_COMPLETE, results)
        return results
```

Then capture the start time. Immediately before the `return await scanSession.run(async (signal) => {` line, add:

```ts
    const scanStartedAt = Date.now()
```

(`app` and `getOsInfo` are already imported/available in this file — they are used elsewhere in it. `scannerFactory` is the module-level factory instance.)

- [ ] **Step 7: Run typecheck + full suite**

Run: `npm run typecheck` → exit 0.
Run: `npm test` → all green (the report-context test is included).

- [ ] **Step 8: Commit**

```bash
git add src/main/intel/report-context.ts src/main/intel/report-context.test.ts src/main/scanners/index.ts src/main/ipc-handlers.ts
git commit -m "feat(intel): build and emit ScanReport on SCAN_REPORT after each scan"
```

---

### Task 8: Preload bridge + renderer store hold the report

Expose `onScanReport` over the context bridge and store the report in the scan-store.

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/stores/scan-store.ts`
- Test: `src/renderer/stores/scan-store.test.ts`

**Interfaces:**
- Consumes: `ScanReport`, `IPC_CHANNELS` from shared types.
- Produces: `electronAPI.onScanReport(cb)` + `ScanReportCallback` type; scan-store `report: ScanReport | null` + `setReport(report)`.

- [ ] **Step 1: Add the preload bridge**

In `src/preload/index.ts`, add `ScanReport` to the existing type import from `../shared/types`:

```ts
import { IPC_CHANNELS, ScanResult, ScanProgress, UserSettings, ScannerInfo, OsInfo, ScannerCapability, ScannerName, LiveFinding, LiveScanStatus, ScanReport } from '../shared/types'
```

Add a callback type next to the other scan callback types (after `ScanErrorCallback`):

```ts
export type ScanReportCallback = (report: ScanReport) => void
```

Add this method to the `api` object, right after `onScanComplete`:

```ts
  onScanReport: (callback: ScanReportCallback): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, report: ScanReport): void => {
      callback(report)
    }
    ipcRenderer.on(IPC_CHANNELS.SCAN_REPORT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SCAN_REPORT, listener)
  },
```

- [ ] **Step 2: Write the failing store test**

Create `src/renderer/stores/scan-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStore } from './scan-store'
import type { ScanReport } from '../../shared/types'

const report: ScanReport = {
  id: 'scan-1',
  meta: { appVersion: '3.0.0', engineVersion: '1.0.0', scannedAt: '2026-06-19T00:00:00.000Z', durationMs: 10, gameId: null, signatureVersion: 'bundled-1' },
  verdict: { score: 25, band: 'low', rationale: 'An isolated keyword match', reasons: [] },
  findings: [],
  correlations: [],
  scanners: []
}

describe('scan store report', () => {
  beforeEach(() => useScanStore.getState().reset())

  it('starts with no report', () => {
    expect(useScanStore.getState().report).toBeNull()
  })

  it('stores a report', () => {
    useScanStore.getState().setReport(report)
    expect(useScanStore.getState().report?.verdict.band).toBe('low')
  })

  it('clears the report on reset', () => {
    useScanStore.getState().setReport(report)
    useScanStore.getState().reset()
    expect(useScanStore.getState().report).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stores/scan-store.test.ts`
Expected: FAIL — `setReport` is not a function.

- [ ] **Step 4: Add report state to the store**

In `src/renderer/stores/scan-store.ts`:

1. Add `ScanReport` to the import:

```ts
import { ScanResult, ScanProgress, ScannerInfo, ScanReport } from '../../shared/types'
```

2. In the `ScanState` interface, add to the state section (after `error: string | null`):

```ts
  report: ScanReport | null
```

and add the action (after `setError`):

```ts
  setReport: (report: ScanReport | null) => void
```

3. In the `create<ScanState>(...)` initial state, add (after `error: null,`):

```ts
  report: null,
```

4. Add the action implementation (after `setError`):

```ts
  setReport: (report) => set({ report }),
```

5. In `reset`, add `report: null,` to the object passed to `set({...})`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/stores/scan-store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + full suite + commit**

Run: `npm run typecheck` → exit 0.
Run: `npm test` → all green.

```bash
git add src/preload/index.ts src/renderer/stores/scan-store.ts src/renderer/stores/scan-store.test.ts
git commit -m "feat(intel): bridge SCAN_REPORT to renderer and hold it in scan-store"
```

---

### Task 9: Verdict card + severity chips on Results

Subscribe to the report, render a verdict card, and tag each finding with its severity. The full triage redesign (search/sort/filter/dismiss) is a later phase — this is the minimal visible surface for the engine.

**Files:**
- Create: `src/renderer/utils/report-view.ts`
- Test: `src/renderer/utils/report-view.test.ts`
- Modify: `src/renderer/pages/Scan.tsx` (subscribe to the report)
- Modify: `src/renderer/pages/Results.tsx` (verdict card + severity chips)
- Modify: `src/renderer/i18n/en.json` and `src/renderer/i18n/ru.json` (verdict/severity strings)

**Interfaces:**
- Consumes: `ScanReport`, `Severity`, `VerdictBand` from shared types; `useScanStore` (`report`, `setReport`); `SCANNER_DISPLAY_TO_ID`.
- Produces: `buildSeverityLookup(report)`, `severityChipClass(sev)`, `bandChipClass(band)` (in `report-view.ts`).

- [ ] **Step 1: Write the failing helper test**

Create `src/renderer/utils/report-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSeverityLookup, severityKey } from './report-view'
import type { ScanReport } from '../../shared/types'

const report: ScanReport = {
  id: 'scan-1',
  meta: { appVersion: '3.0.0', engineVersion: '1.0.0', scannedAt: 'now', durationMs: 1, gameId: null, signatureVersion: 'bundled-1' },
  verdict: { score: 92, band: 'critical', rationale: 'x', reasons: [] },
  findings: [
    { id: 'a', scannerId: 'appdata', value: 'C:/undead.exe', category: 'file', matched: 'undead', severity: 'high', baseSeverity: 'medium', confidence: 'high', baseConfidence: 'low', correlationId: 'c1', reasons: [] }
  ],
  correlations: [],
  scanners: []
}

describe('report-view', () => {
  it('builds a (scannerId,value)→severity lookup', () => {
    const lookup = buildSeverityLookup(report)
    expect(lookup.get(severityKey('appdata', 'C:/undead.exe'))).toBe('high')
  })

  it('returns an empty lookup for a null report', () => {
    expect(buildSeverityLookup(null).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/utils/report-view.test.ts`
Expected: FAIL — cannot find module `./report-view`.

- [ ] **Step 3: Create `src/renderer/utils/report-view.ts`**

```ts
import type { ScanReport, Severity, VerdictBand } from '../../shared/types'

export function severityKey(scannerId: string, value: string): string {
  return `${scannerId} ${value}`
}

/** Map (scannerId,value) → severity so the per-scanner Results view can tag each row. */
export function buildSeverityLookup(report: ScanReport | null): Map<string, Severity> {
  const m = new Map<string, Severity>()
  if (!report) return m
  for (const f of report.findings) m.set(severityKey(f.scannerId, f.value), f.severity)
  return m
}

/** Tailwind classes for a severity chip (tokens already defined in the theme). */
export function severityChipClass(sev: Severity): string {
  switch (sev) {
    case 'critical': return 'bg-alert/15 text-alert'
    case 'high': return 'bg-alert/10 text-alert'
    case 'medium': return 'bg-amber-500/10 text-amber-500'
    case 'low': return 'bg-panel-2 text-ink-dim'
    case 'info': return 'bg-panel-2 text-ink-dim/70'
  }
}

/** Tailwind classes for the verdict band badge. */
export function bandChipClass(band: VerdictBand): string {
  switch (band) {
    case 'critical': return 'bg-alert/15 text-alert'
    case 'high': return 'bg-alert/10 text-alert'
    case 'medium': return 'bg-amber-500/10 text-amber-500'
    case 'low': return 'bg-scan/10 text-scan'
    case 'clean': return 'bg-scan/10 text-scan'
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/utils/report-view.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Subscribe to the report in `Scan.tsx`**

In `src/renderer/pages/Scan.tsx`, add `setReport` to the destructured store (in the `useScanStore()` call, add it to the list, e.g. after `setResults`):

```ts
    setReport,
```

In the `useEffect`, after the `unsubComplete` line, add a report subscription:

```ts
    const unsubReport = window.electronAPI.onScanReport(setReport)
```

And in the cleanup `return () => { ... }`, add:

```ts
      unsubReport()
```

- [ ] **Step 6: Add the verdict card + severity chips to `Results.tsx`**

In `src/renderer/pages/Results.tsx`:

1. Extend the store destructure to include `report`:

```ts
  const { results, status, _totalFindings, report } = useScanStore()
```

2. Add imports near the top (with the other imports):

```ts
import { buildSeverityLookup, severityKey, severityChipClass, bandChipClass } from '../utils/report-view'
import { SCANNER_DISPLAY_TO_ID } from '../../shared/scanners-meta'
```

3. Inside the component, after `const hasResults = results.length > 0`, add:

```ts
  const severityLookup = buildSeverityLookup(report)
```

4. Render the verdict card. Immediately after the opening `<div className="animate-fade-in">` (before the Summary Card), insert:

```tsx
        {report && (
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1 rounded-lg text-sm font-bold ${bandChipClass(report.verdict.band)}`}>
                    {t(`verdict.band.${report.verdict.band}`)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-ink font-display">{t('verdict.title')}</h2>
                    <p className="text-sm text-ink-dim">{report.verdict.rationale}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-ink font-display">{report.verdict.score}</div>
                  <div className="text-xs text-ink-dim">{t('verdict.score')}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-dim/80 border-t border-[color:var(--line)] pt-3">
                {t('verdict.leadsNotProof')}
              </p>
            </CardContent>
          </Card>
        )}
```

5. Tag each finding row with a severity chip. Find the finding row block:

```tsx
                            {result.findings.map((finding, i) => (
                              <div
                                key={i}
                                className="text-xs text-ink-dim bg-panel-2 p-2 rounded-lg break-all font-mono"
                              >
                                {finding}
                              </div>
                            ))}
```

Replace it with:

```tsx
                            {result.findings.map((finding, i) => {
                              const sid = SCANNER_DISPLAY_TO_ID[result.scannerName]
                              const sev = sid ? severityLookup.get(severityKey(sid, finding)) : undefined
                              return (
                                <div
                                  key={i}
                                  className="text-xs text-ink-dim bg-panel-2 p-2 rounded-lg break-all font-mono flex items-start gap-2"
                                >
                                  {sev && (
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase not-italic ${severityChipClass(sev)}`}>
                                      {t(`severity.${sev}`)}
                                    </span>
                                  )}
                                  <span className="min-w-0">{finding}</span>
                                </div>
                              )
                            })}
```

- [ ] **Step 7: Add i18n strings**

In `src/renderer/i18n/en.json`, add these two top-level keys (as new entries in the root object):

```json
  "verdict": {
    "title": "Risk verdict",
    "score": "Risk score",
    "leadsNotProof": "Findings are leads, not proof — investigate before acting.",
    "band": {
      "clean": "Clean",
      "low": "Low",
      "medium": "Medium",
      "high": "High",
      "critical": "Critical"
    }
  },
  "severity": {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "info": "Info"
  },
```

In `src/renderer/i18n/ru.json`, add the matching top-level keys:

```json
  "verdict": {
    "title": "Оценка риска",
    "score": "Уровень риска",
    "leadsNotProof": "Находки — это зацепки, а не доказательство. Проверьте, прежде чем действовать.",
    "band": {
      "clean": "Чисто",
      "low": "Низкий",
      "medium": "Средний",
      "high": "Высокий",
      "critical": "Критический"
    }
  },
  "severity": {
    "critical": "Критический",
    "high": "Высокий",
    "medium": "Средний",
    "low": "Низкий",
    "info": "Инфо"
  },
```

(Place each block as a sibling of the existing top-level keys; ensure the surrounding commas keep the JSON valid.)

- [ ] **Step 8: Typecheck, test, and build the renderer**

Run: `npm run typecheck` → exit 0.
Run: `npm test` → all green.
Run: `npm run build` → Expected: completes without errors (validates the JSON + TSX compile end-to-end).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/utils/report-view.ts src/renderer/utils/report-view.test.ts src/renderer/pages/Scan.tsx src/renderer/pages/Results.tsx src/renderer/i18n/en.json src/renderer/i18n/ru.json
git commit -m "feat(intel): verdict card and per-finding severity chips on Results"
```

---

## Phase 1 Done — Definition of Complete

- `npm run typecheck` exits 0; `npm test` all green (existing 251 + the new intel tests).
- `npm run build` succeeds.
- Running a scan shows a **verdict card** (band + score + rationale + "leads, not proof" line) and **severity chips** on findings.
- The engine is pure and deterministic; suppression is honoured (even though no UI sets it yet).
- No scanner logic changed; `ScanResult.findings: string[]` unchanged.

**Next:** Phase 2 (persistence + history + diff) gets its own plan, built on the `ScanReport` this phase introduced.

## Self-Review (completed during authoring)

- **Spec coverage:** Phase 1 items from the spec (§4 data model, §5 engine classify/correlate/conservative-verdict, §5.4 wiring, minimal verdict UI) are each implemented by Tasks 1–9. The two-axis model (§2), explainability reasons (§5.3), `engineVersion` (§5.4/§6), hash-trust verified/community (§5.1/§5.3), and the suppression model defined-now (§4) are all present in Tasks 1, 4, 5, 6. Persistence/triage/remote-signatures/export/polish are intentionally deferred to later phases.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; `SIGNATURE_VERSION='bundled-1'` is a real value documented as Phase-1 static.
- **Type consistency:** `AnalyzedFinding`, `Correlation`, `Verdict`, `ScanReport`, `AnalyzeContext`, `SuppressionState` names/shapes match across Tasks 1→6→7→8→9; `severityKey`, `buildSeverityLookup`, `scannerIdFromDisplayName`, `getKeywordMatcher`, `onScanReport`, `setReport` are referenced exactly as defined.
