# Security & Correctness Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified security and correctness finding in the `custos` Electron anti-cheat scanner — a shared open-validator, a revived AOB scan path, correct 64-bit pointer math, a leak-free thread enumerator, a working inline-hook detector, plus the MEDIUM/LOW hardening items.

**Architecture:** One branch off `dev`, delivered as sequenced workstreams by tier (HIGH → MEDIUM → LOW), each task its own commit. The recurring move is to **extract decision logic into pure, electron-free, native-free exported helpers** so it can be unit-tested with vitest on macOS/Linux, exactly like the existing `isScannablePattern`/`buildAobFinding`/`classifyModule` helpers. Native and Electron behaviour is verified manually on Windows.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), `vitest` (`npm test` = `vitest run`), `zod`, `memoryjs` (Windows-only native, lazy-loaded), `koffi` (Win32 FFI). Gates per task: `npm test`, `npm run typecheck`, `npm run lint`.

---

## File Structure

**New files**
- `src/main/utils/url-policy.ts` — pure URL/path validation predicates (no electron import). W1.
- `src/main/utils/url-policy.test.ts` — tests for the predicates. W1.
- `src/main/utils/safe-open.ts` — `safeOpenExternal` / `safeOpenPath` shell wrappers (imports electron + url-policy). W1.
- `src/main/live/native/ptr.ts` — `ptrInRange` / `formatPtr` / `toPtr` bigint helpers. W3.
- `src/main/live/native/ptr.test.ts` — tests for the pointer helpers. W3.
- `src/main/live/signatures.test.ts` — tests for stricter `parseAobPattern`. W6.
- `src/main/services/semver.test.ts` — tests for pre-release ordering. W7.

**Modified files**
- `src/main/ipc-handlers.ts` — route `APP_OPEN_EXTERNAL`/`APP_OPEN_PATH` through safe-open; re-validate settings on `SETTINGS_GET`. W1, W7.
- `src/main/index.ts` — route `setWindowOpenHandler` through safe-open; add `will-navigate` guard; evaluate `sandbox:true`. W1, W7.
- `src/main/live/native/memory.ts` — fix `scanPattern` dispatch. W2.
- `src/main/live/detectors/aob-detector.ts` — `bigint` address. W2/W3.
- `src/main/live/detectors/aob-detector.test.ts` — update for `bigint`. W3.
- `src/main/live/detectors/thread-detector.ts` — bigint ranges. W3.
- `src/main/live/detectors/thread-detector.test.ts` — update for bigint. W3.
- `src/main/live/detectors/hook-detector.ts` — real export-address prologue check. W5.
- `src/main/live/detectors/hook-detector.test.ts` — already tests `isHookedPrologue`; keep. W5.
- `src/main/live/detectors/injected-module-detector.ts` — bigint region addr + protection mask + region confidence. W3/W6.
- `src/main/live/native/winapi.ts` — handle-leak try/finally; INVALID_HANDLE check; bigint start addr; `resolveExportAddresses`. W3/W4/W5.
- `src/main/live/signatures.ts` — strict AOB token validation. W6.
- `src/main/live/process-locator.ts` + `src/main/live/live-orchestrator.ts` — PID re-validation. W6.
- `src/main/services/github-service.ts` — discriminated release result + zod JSON parse. W6/W7.
- `src/main/services/updater.ts` — `checkFailed` tri-state + URL from REPO. W1/W6.
- `src/shared/types.ts` — `UpdateInfo.checkFailed`. W6.
- `src/main/services/semver.ts` — pre-release ordering. W7.
- `src/main/utils/async-exec.ts` — `execFileAsync` timeout. W6.
- `src/main/scanners/recent-files-scanner.ts` — PowerShell via stdin. W6.
- `src/main/scanners/browser-history-scanner.ts` — size cap before `readFileSync`. W7.
- `src/renderer/index.html` — CSP `style-src` review. W7.

---

# WORKSTREAM 1 — Shared open-validator (HIGH / Security)

## Task 1.1: Pure URL/path policy predicates

**Files:**
- Create: `src/main/utils/url-policy.ts`
- Test: `src/main/utils/url-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/utils/url-policy.test.ts
import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl, isAllowedLocalPath, expandEnv } from './url-policy'

describe('isAllowedExternalUrl', () => {
  it('allows https, ms-* and windowsdefender schemes', () => {
    expect(isAllowedExternalUrl('https://github.com/dybeky/custos')).toBe(true)
    expect(isAllowedExternalUrl('ms-settings:datausage')).toBe(true)
    expect(isAllowedExternalUrl('windowsdefender:')).toBe(true)
  })
  it('rejects dangerous schemes and junk', () => {
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false)
    expect(isAllowedExternalUrl('ms-msdt:/id PCWDiagnostic')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('http://insecure.example')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})

describe('expandEnv', () => {
  it('expands %VAR% from process.env', () => {
    process.env.CUSTOS_TEST_VAR = 'C:\\Users\\x'
    expect(expandEnv('%CUSTOS_TEST_VAR%\\Downloads')).toBe('C:\\Users\\x\\Downloads')
  })
})

describe('isAllowedLocalPath', () => {
  it('allows drive-letter directories', () => {
    expect(isAllowedLocalPath('C:\\Windows\\Prefetch')).toBe(true)
    expect(isAllowedLocalPath('C:\\Program Files (x86)\\Steam')).toBe(true)
  })
  it('delegates URI schemes to the external policy', () => {
    expect(isAllowedLocalPath('ms-settings:datausage')).toBe(true)
    expect(isAllowedLocalPath('windowsdefender:')).toBe(true)
  })
  it('rejects UNC paths and executables', () => {
    expect(isAllowedLocalPath('\\\\attacker\\share\\evil.exe')).toBe(false)
    expect(isAllowedLocalPath('C:\\Windows\\System32\\cmd.exe')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\payload.bat')).toBe(false)
    expect(isAllowedLocalPath('C:\\x\\run.ps1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/utils/url-policy.test.ts`
Expected: FAIL — `Cannot find module './url-policy'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/utils/url-policy.ts
/**
 * Pure URL/path policy predicates for the privileged shell.open* IPC handlers.
 * No electron import → unit-testable on any platform.
 *
 * Trust boundary: these run in the main process. Renderer callers pass constants
 * today, but a renderer compromise or a spoofed network value (e.g. a GitHub
 * release html_url) must never reach shell.openExternal/openPath unchecked.
 */

/** Extensions that shell.openPath would launch as a program — never allowed. */
const EXECUTABLE_EXT =
  /\.(exe|bat|cmd|com|scr|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|lnk|cpl|hta|pif|reg|jar|gadget)$/i

/** A leading "<scheme>:" that is NOT a drive-letter path like C:\ or C:/. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const DRIVE_LETTER = /^[A-Za-z]:[\\/]/
const UNC = /^\\\\/

/** Expand %VAR% references from the process environment (empty string if unset). */
export function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] || '')
}

/** True when a URL is safe to hand to shell.openExternal. */
export function isAllowedExternalUrl(url: string): boolean {
  let scheme: string
  try {
    scheme = new URL(url).protocol.replace(/:$/, '').toLowerCase()
  } catch {
    return false
  }
  if (scheme === 'https') return true
  if (scheme === 'windowsdefender') return true
  return /^ms-[a-z0-9-]*$/.test(scheme)
}

/** True when a path (after %ENV% expansion) is safe to hand to shell.openPath. */
export function isAllowedLocalPath(rawPath: string): boolean {
  const p = expandEnv(rawPath)
  // URI scheme that is not a drive-letter path → defer to the external policy.
  if (URI_SCHEME.test(p) && !DRIVE_LETTER.test(p)) return isAllowedExternalUrl(p)
  if (UNC.test(p)) return false
  if (!DRIVE_LETTER.test(p)) return false
  if (EXECUTABLE_EXT.test(p)) return false
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/utils/url-policy.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/url-policy.ts src/main/utils/url-policy.test.ts
git commit -m "feat(security): add pure URL/path policy predicates"
```

## Task 1.2: safe-open shell wrappers

**Files:**
- Create: `src/main/utils/safe-open.ts`

- [ ] **Step 1: Write the implementation** (thin electron wrapper — covered by manual verification, not unit tests, since it touches `shell`)

```ts
// src/main/utils/safe-open.ts
import { shell } from 'electron'
import { logger } from '../services/logger'
import { expandEnv, isAllowedExternalUrl, isAllowedLocalPath } from './url-policy'

const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const DRIVE_LETTER = /^[A-Za-z]:[\\/]/

/** Validate then open an external URL; drop + log anything not on the scheme allowlist. */
export function safeOpenExternal(url: string): void {
  if (!isAllowedExternalUrl(url)) {
    logger.warn('Blocked external open (scheme not allowed)', { url })
    return
  }
  shell.openExternal(url).catch((err) =>
    logger.warn('Failed to open external URL', { url, error: err instanceof Error ? err.message : String(err) })
  )
}

/** Expand %ENV%, route URI schemes to safeOpenExternal, else validate + openPath. */
export function safeOpenPath(rawPath: string): void {
  const expanded = expandEnv(rawPath)
  if (URI_SCHEME.test(expanded) && !DRIVE_LETTER.test(expanded)) {
    safeOpenExternal(expanded)
    return
  }
  if (!isAllowedLocalPath(rawPath)) {
    logger.warn('Blocked path open (not an allowed local path)', { path: expanded })
    return
  }
  shell.openPath(expanded).catch((err) =>
    logger.warn('Failed to open path', { path: expanded, error: err instanceof Error ? err.message : String(err) })
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/utils/safe-open.ts
git commit -m "feat(security): add safeOpenExternal/safeOpenPath wrappers"
```

## Task 1.3: Wire IPC handlers through safe-open

**Files:**
- Modify: `src/main/ipc-handlers.ts:156-181`

- [ ] **Step 1: Replace the two handlers.** Find the block at `ipc-handlers.ts:156-181` (the `APP_OPEN_EXTERNAL` and `APP_OPEN_PATH` handlers) and replace it with:

```ts
  // Open external URL - validated against the scheme allowlist
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_event, url: string): void => {
    safeOpenExternal(url)
  })

  // Open path in explorer - validated; %ENV% expansion + scheme routing live in safeOpenPath
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_PATH, (_event, path: string): void => {
    safeOpenPath(path)
  })
```

- [ ] **Step 2: Add the import** near the other imports at the top of `ipc-handlers.ts`:

```ts
import { safeOpenExternal, safeOpenPath } from './utils/safe-open'
```

- [ ] **Step 3: Verify `shell` is still used elsewhere.** Run `grep -n "shell" src/main/ipc-handlers.ts`. If `shell` is now unused (the registry handler at :184 may still use it), remove it from the electron import to satisfy lint; otherwise leave it.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "fix(security): route APP_OPEN_* IPC through validated safe-open"
```

## Task 1.4: Harden window-open handler + add will-navigate guard

**Files:**
- Modify: `src/main/index.ts:1-6` (imports), `src/main/index.ts:39-42` (window-open handler)

- [ ] **Step 1: Update imports.** At `index.ts:1`, change the electron import to drop `shell` if it becomes unused, and add the safe-open import after the existing `setupIpcHandlers` import:

```ts
import { safeOpenExternal } from './utils/safe-open'
```

- [ ] **Step 2: Replace the window-open handler and add a navigation guard.** Replace `index.ts:39-42` with:

```ts
  mainWindow.webContents.setWindowOpenHandler((details) => {
    safeOpenExternal(details.url)
    return { action: 'deny' }
  })

  // Keep the privileged electronAPI bridge from ever living on a foreign origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      (is.dev && process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) ||
      url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      logger.warn('Blocked in-frame navigation', { url })
    }
  })
```

- [ ] **Step 3: Confirm `shell` import.** Run `grep -n "shell\." src/main/index.ts`. If no remaining uses, remove `shell` from the `electron` import line. `logger` is already imported (`index.ts:6`).

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "fix(security): validate window-open scheme and block off-origin navigation"
```

## Task 1.5: Construct the update URL from REPO, not html_url

**Files:**
- Modify: `src/main/services/updater.ts:13-26`

- [ ] **Step 1: Write the failing test.** Append to a new/updated test file `src/main/services/updater.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateUpdate } from './updater'
import type { GithubRelease } from './github-service'

const rel = (tag: string): GithubRelease => ({
  tagName: tag, body: '- New thing', htmlUrl: 'https://evil.example/pwn', publishedAt: '2026-01-01T00:00:00Z'
})

describe('evaluateUpdate URL', () => {
  it('builds the download URL from REPO, ignoring the API html_url', () => {
    const info = evaluateUpdate('1.0.0', rel('v2.0.0'))
    expect(info.updateAvailable).toBe(true)
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v2.0.0')
    expect(info.url).not.toContain('evil.example')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/updater.test.ts`
Expected: FAIL — `info.url` equals the html_url.

- [ ] **Step 3: Edit `updater.ts`.** Add the import at the top:

```ts
import { getLatestRelease, REPO, type GithubRelease } from './github-service'
```

Then change the `url:` line inside `evaluateUpdate` (currently `url: updateAvailable ? release.htmlUrl : null,`) to:

```ts
    url: updateAvailable ? `https://github.com/${REPO}/releases/tag/${release.tagName}` : null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/updater.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/updater.ts src/main/services/updater.test.ts
git commit -m "fix(security): build update URL from REPO constant, not API html_url"
```

---

# WORKSTREAM 2 — AOB module-less dispatch (HIGH / Bug)

## Task 2.1: Branch findPattern on module presence

**Files:**
- Modify: `src/main/live/native/memory.ts:117-132`
- Test: add a test block to a new `src/main/live/native/memory.test.ts`

- [ ] **Step 1: Write the failing test** (pure arg-builder helper — no native, no platform gate)

```ts
// src/main/live/native/memory.test.ts
import { describe, it, expect } from 'vitest'
import { findPatternArgs } from './memory'

describe('findPatternArgs', () => {
  it('uses the 4-arg all-memory overload when module is empty', () => {
    expect(findPatternArgs(1, '', '48 8B', 0, 0)).toEqual([1, '48 8B', 0, 0])
  })
  it('uses the 5-arg by-module overload when module is named', () => {
    expect(findPatternArgs(1, 'game.exe', '48 8B', 0, 0)).toEqual([1, 'game.exe', '48 8B', 0, 0])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/native/memory.test.ts`
Expected: FAIL — `findPatternArgs` not exported.

- [ ] **Step 3: Edit `memory.ts`.** Add the exported helper just above `scanPattern`, and use it inside `scanPattern`:

```ts
/**
 * Build the argument list for memoryjs.findPattern. memoryjs dispatches by arity:
 * 5 args (handle, module, pattern, flags, offset) → findPatternByModule;
 * 4 args (handle, pattern, flags, offset) → findPattern over all committed memory.
 * Passing an empty module string to the 5-arg form searches a module named "" and
 * never matches — so module-less signatures must use the 4-arg overload.
 */
export function findPatternArgs(
  handle: number, module: string, pattern: string, flags: number, offset: number
): unknown[] {
  return module
    ? [handle, module, pattern, flags, offset]
    : [handle, pattern, flags, offset]
}
```

Then replace the body of the `try` in `scanPattern` (`return m.findPattern(handle, module, pattern, flags, offset)`) with:

```ts
    const fn = m.findPattern as (...a: unknown[]) => PatternResult
    return fn(...findPatternArgs(handle, module, pattern, flags, offset))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/live/native/memory.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/live/native/memory.ts src/main/live/native/memory.test.ts
git commit -m "fix(live): scan all memory for module-less AOB signatures"
```

---

# WORKSTREAM 3 — 64-bit pointer correctness (HIGH / Bug)

> Note: canonical x64 user-mode addresses fit in 47 bits (< 2^53), so doubles are
> usually exact today. This change makes range math correct by construction (and
> safe for any high/kernel address) and removes the lossy `Number()` cast.

## Task 3.1: bigint pointer helpers

**Files:**
- Create: `src/main/live/native/ptr.ts`
- Test: `src/main/live/native/ptr.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/live/native/ptr.test.ts
import { describe, it, expect } from 'vitest'
import { ptrInRange, formatPtr, toPtr } from './ptr'

describe('ptrInRange', () => {
  it('is end-exclusive and correct above 2^53', () => {
    const base = toPtr('0x7FF600000000')
    const size = toPtr(0x10000)
    expect(ptrInRange(base, base, size)).toBe(true)
    expect(ptrInRange(base + 0xffffn, base, size)).toBe(true)
    expect(ptrInRange(base + 0x10000n, base, size)).toBe(false)
    expect(ptrInRange(base - 1n, base, size)).toBe(false)
  })
})

describe('formatPtr', () => {
  it('renders uppercase hex with 0x prefix', () => {
    expect(formatPtr(toPtr('0x1400abcde'))).toBe('0x1400ABCDE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/native/ptr.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/main/live/native/ptr.ts
/** Pointer arithmetic in bigint so x64 addresses are never truncated by doubles. */

export function toPtr(v: number | bigint | string): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'string') return BigInt(v)
  return BigInt(Math.trunc(v))
}

/** True when addr ∈ [base, base+size). End-exclusive. */
export function ptrInRange(addr: bigint, base: bigint, size: bigint): boolean {
  return addr >= base && addr < base + size
}

/** Render an address as uppercase hex (e.g. "0x1400ABCDE"). */
export function formatPtr(addr: bigint): string {
  return '0x' + addr.toString(16).toUpperCase()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/live/native/ptr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/live/native/ptr.ts src/main/live/native/ptr.test.ts
git commit -m "feat(live): add bigint pointer helpers (ptrInRange/formatPtr/toPtr)"
```

## Task 3.2: Read thread start address as bigint in winapi

**Files:**
- Modify: `src/main/live/native/winapi.ts:147` (NtQueryInformationThread decl), `:156-185` (function), and signature return type.

- [ ] **Step 1: Change the koffi NtQueryInformationThread `info` param to a uint64 out-buffer and read it as bigint.** In `loadThreadApi`, change the decl at `winapi.ts:147` to write into a `uint64`:

```ts
      NtQueryInformationThread: nt.func('long __stdcall NtQueryInformationThread(void *h, int cls, _Out_ uint64 *info, uint32 len, _Out_ uint32 *ret)'),
```

- [ ] **Step 2: Change `listThreadStartAddresses` to return `bigint[]`** and read the buffer as bigint. Replace the address-read lines (`const addrBuf: any[] = [0]` … `if (status === 0) out.push(Number(addrBuf[0]))`) with:

```ts
          const addrBuf = [0n] as bigint[] // koffi writes back an 8-byte uint64
          const retLen = [0]
          const status = api.NtQueryInformationThread(h, ThreadQuerySetWin32StartAddress, addrBuf, 8, retLen) as number
          if (status === 0) out.push(toPtr(addrBuf[0]))
```

and change the declaration to `const out: bigint[] = []` and the return type to `: bigint[]`. Add the import at the top of `winapi.ts`:

```ts
import { toPtr } from './ptr'
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `thread-detector.ts` (consumer not yet updated) — that's expected; the next task fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/main/live/native/winapi.ts src/main/live/native/ptr.ts
git commit -m "fix(live): read thread start addresses as bigint (no Number truncation)"
```

## Task 3.3: bigint ranges in thread-detector

**Files:**
- Modify: `src/main/live/detectors/thread-detector.ts`
- Modify: `src/main/live/detectors/thread-detector.test.ts`

- [ ] **Step 1: Update the test** to use bigint. Replace the body of `thread-detector.test.ts` so `isAddressInAnyModule` takes bigint:

```ts
import { describe, it, expect } from 'vitest'
import { isAddressInAnyModule, type ModuleRange } from './thread-detector'

const mods: ModuleRange[] = [{ name: 'game.exe', base: 0x140000000n, size: 0x100000n }]

describe('isAddressInAnyModule', () => {
  it('true inside a module range, false outside', () => {
    expect(isAddressInAnyModule(0x140000500n, mods)).toBe(true)
    expect(isAddressInAnyModule(0x200000000n, mods)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/detectors/thread-detector.test.ts`
Expected: FAIL (type/contract mismatch — `base` is currently `number`).

- [ ] **Step 3: Edit `thread-detector.ts`.** Replace the file's `ModuleRange`, helper, and `run` with bigint-based versions:

```ts
import { listModules } from '../native/memory'
import { listThreadStartAddresses } from '../native/winapi'
import { ptrInRange, formatPtr, toPtr } from '../native/ptr'
import type { LiveContext, LiveFinding } from '../../../shared/types'

export interface ModuleRange { name: string; base: bigint; size: bigint }

/** True when `addr` falls within [base, base+size) of any module. End-exclusive. */
export function isAddressInAnyModule(addr: bigint, modules: ModuleRange[]): boolean {
  return modules.some((m) => ptrInRange(addr, m.base, m.size))
}

export const threadDetector = {
  id: 'thread-start',
  name: 'Thread Start-Address Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const ranges: ModuleRange[] = listModules(ctx.pid).map((m) => ({
      name: m.szModule ?? '',
      base: toPtr(m.modBaseAddr),
      size: toPtr(m.modBaseSize)
    }))
    if (ranges.length === 0) return []

    const findings: LiveFinding[] = []
    for (const addr of listThreadStartAddresses(ctx.pid)) {
      if (addr !== 0n && !isAddressInAnyModule(addr, ranges)) {
        findings.push({
          detectorId: 'thread-start',
          detectorName: 'Thread Start-Address Check',
          title: 'Thread starting outside any module',
          detail: `A thread starts at ${formatPtr(addr)}, which is not inside any loaded module — possible injected/manual-mapped code.`,
          confidence: 'suspicious'
        })
      }
    }
    return findings
  }
}
```

> Note: `m.modBaseAddr`/`m.modBaseSize` are typed `number` by memoryjs; `toPtr` accepts `number | bigint | string` and truncates the (already-integer) value safely.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/main/live/detectors/thread-detector.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/live/detectors/thread-detector.ts src/main/live/detectors/thread-detector.test.ts
git commit -m "fix(live): compare thread start addresses with bigint ranges"
```

## Task 3.4: bigint address in aob-detector

**Files:**
- Modify: `src/main/live/detectors/aob-detector.ts:11-39`
- Modify: `src/main/live/detectors/aob-detector.test.ts:14-22`

- [ ] **Step 1: Update the buildAobFinding test** for a bigint address:

```ts
describe('buildAobFinding', () => {
  it('produces a high-confidence finding with name + address', () => {
    const f = buildAobFinding('undead-menu', 0x1400abcden)
    expect(f.confidence).toBe('high')
    expect(f.detectorId).toBe('aob')
    expect(f.detail).toContain('undead-menu')
    expect(f.detail.toUpperCase()).toContain('1400ABCDE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/detectors/aob-detector.test.ts`
Expected: FAIL — `buildAobFinding` currently types `address: number`.

- [ ] **Step 3: Edit `aob-detector.ts`.** Change `buildAobFinding` to take `bigint` and format via `formatPtr`; convert native results with `toPtr`:

```ts
import { scanPattern } from '../native/memory'
import { parseAobPattern } from '../signatures'
import { formatPtr, toPtr } from '../native/ptr'
import type { LiveContext, LiveFinding } from '../../../shared/types'

export function isScannablePattern(pattern: string): boolean {
  return parseAobPattern(pattern) !== null
}

export function buildAobFinding(name: string, address: bigint): LiveFinding {
  return {
    detectorId: 'aob',
    detectorName: 'AOB Memory Signature Scan',
    title: 'Cheat signature found in memory',
    detail: `Signature "${name}" matched at ${formatPtr(address)}.`,
    confidence: 'high'
  }
}

export const aobDetector = {
  id: 'aob',
  name: 'AOB Memory Signature Scan',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []
    for (const sig of ctx.signatures.aob) {
      if (!isScannablePattern(sig.pattern)) continue
      const result = scanPattern(ctx.handle, sig.module ?? '', sig.pattern)
      if (result && typeof result === 'number' && result !== 0) {
        findings.push(buildAobFinding(sig.name, toPtr(result)))
      } else if (result && typeof result === 'object' && 'address' in result && (result as { address: number }).address) {
        findings.push(buildAobFinding(sig.name, toPtr((result as { address: number }).address)))
      }
    }
    return findings
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/main/live/detectors/aob-detector.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/live/detectors/aob-detector.ts src/main/live/detectors/aob-detector.test.ts
git commit -m "fix(live): carry AOB match address as bigint"
```

## Task 3.5: bigint region address in injected-module-detector

**Files:**
- Modify: `src/main/live/detectors/injected-module-detector.ts:164`

- [ ] **Step 1: Edit the region-finding detail** to format the base address through `formatPtr(toPtr(...))`. Add the import:

```ts
import { formatPtr, toPtr } from '../native/ptr'
```

Change the `detail:` line at `:164` to:

```ts
          detail: `MEM_PRIVATE + executable protection at ${formatPtr(toPtr(region.BaseAddress))} (size: ${region.RegionSize} bytes) — possible manual-mapped code`,
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/live/detectors/injected-module-detector.ts
git commit -m "fix(live): format region base address with bigint helper"
```

---

# WORKSTREAM 4 — Thread-enum handle leak (HIGH / Bug)

## Task 4.1: try/finally CloseHandle + INVALID_HANDLE check

**Files:**
- Modify: `src/main/live/native/winapi.ts:156-185`

- [ ] **Step 1: Rewrite `listThreadStartAddresses`** so the snapshot handle is always closed and invalid snapshots return early. Replace the function body (post Task 3.2 it returns `bigint[]`) with:

```ts
export function listThreadStartAddresses(pid: number): bigint[] {
  if (process.platform !== 'win32') return []
  const api = loadThreadApi()
  const koffi = loadKoffi()
  if (!api || !koffi) return []
  const out: bigint[] = []
  let snap: unknown = null
  try {
    snap = api.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
    // INVALID_HANDLE_VALUE is (HANDLE)-1; koffi surfaces it as null or a sentinel.
    if (!snap) return []
    const te = { dwSize: 28, cntUsage: 0, th32ThreadID: 0, th32OwnerProcessID: 0, tpBasePri: 0, tpDeltaPri: 0, dwFlags: 0 }
    let ok = api.Thread32First(snap, te) as number
    while (ok) {
      if (te.th32OwnerProcessID === pid) {
        const h = api.OpenThread(THREAD_QUERY_INFORMATION, 0, te.th32ThreadID)
        if (h) {
          const addrBuf = [0n] as bigint[]
          const retLen = [0]
          const status = api.NtQueryInformationThread(h, ThreadQuerySetWin32StartAddress, addrBuf, 8, retLen) as number
          if (status === 0) out.push(toPtr(addrBuf[0]))
          api.CloseHandle(h)
        }
      }
      ok = api.Thread32Next(snap, te) as number
    }
  } catch {
    return out
  } finally {
    if (snap) api.CloseHandle(snap)
  }
  return out
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification note.** On Windows, run a live scan against a running game; confirm thread findings still appear and that repeated scans do not leak handles (Process Explorer → handle count stable). Record the observation in the PR description.

- [ ] **Step 4: Commit**

```bash
git add src/main/live/native/winapi.ts
git commit -m "fix(live): close thread snapshot in finally + guard invalid handle"
```

---

# WORKSTREAM 5 — Inline-hook detector: real prologue check (HIGH / Bug)

## Task 5.1: Add export-address resolution to winapi

**Files:**
- Modify: `src/main/live/native/winapi.ts` (add a new lazy binding + exported resolver)

- [ ] **Step 1: Add a lazy `GetModuleHandleA`/`GetProcAddress` binding** below `loadKernel32`. Append:

```ts
// ── Export-address resolution (inline-hook detector) ─────────────────────────

interface ProcApi {
  GetModuleHandleA: KoffiFunction
  GetProcAddress: KoffiFunction
}

let _procApiLoaded = false
let _procApi: ProcApi | null = null

function loadProcApi(): ProcApi | null {
  if (_procApiLoaded) return _procApi
  _procApiLoaded = true
  if (process.platform !== 'win32') return null
  const koffi = loadKoffi()
  if (!koffi) return null
  try {
    const k = koffi.load('kernel32.dll')
    _procApi = {
      GetModuleHandleA: k.func('void * __stdcall GetModuleHandleA(const char *name)'),
      // koffi can read the returned function pointer as a uint64 address.
      GetProcAddress: k.func('uint64 __stdcall GetProcAddress(void *mod, const char *name)')
    }
  } catch {
    _procApi = null
  }
  return _procApi
}

/** API entry points most often inline-hooked by injected cheats. */
export const HOOK_PRONE_EXPORTS: ReadonlyArray<{ module: string; fn: string }> = [
  { module: 'ntdll.dll', fn: 'NtOpenProcess' },
  { module: 'ntdll.dll', fn: 'NtReadVirtualMemory' },
  { module: 'ntdll.dll', fn: 'NtWriteVirtualMemory' },
  { module: 'ntdll.dll', fn: 'NtProtectVirtualMemory' },
  { module: 'kernel32.dll', fn: 'OpenProcess' },
  { module: 'kernel32.dll', fn: 'ReadProcessMemory' },
  { module: 'kernel32.dll', fn: 'WriteProcessMemory' },
  { module: 'user32.dll', fn: 'GetAsyncKeyState' }
]

export interface ResolvedExport { module: string; fn: string; address: bigint }

/**
 * Resolve the in-our-process addresses of HOOK_PRONE_EXPORTS. Returns [] on
 * non-Windows or when koffi is unavailable. Addresses are resolved in the Custos
 * process; the detector reads the *target* process's bytes at the same address
 * (system DLLs load at the same base across processes within a session).
 */
export function resolveExportAddresses(): ResolvedExport[] {
  if (process.platform !== 'win32') return []
  const api = loadProcApi()
  if (!api) return []
  const out: ResolvedExport[] = []
  for (const { module, fn } of HOOK_PRONE_EXPORTS) {
    try {
      const mod = api.GetModuleHandleA(module)
      if (!mod) continue
      const addr = toPtr(api.GetProcAddress(mod, fn) as number | bigint)
      if (addr !== 0n) out.push({ module, fn, address: addr })
    } catch {
      // skip this export
    }
  }
  return out
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/live/native/winapi.ts
git commit -m "feat(live): resolve hook-prone export addresses via GetProcAddress"
```

## Task 5.2: Rework hook-detector to check resolved export prologues

**Files:**
- Modify: `src/main/live/detectors/hook-detector.ts`
- The existing `hook-detector.test.ts` already tests `isHookedPrologue` — keep it; add no new pure logic.

- [ ] **Step 1: Replace the `run` method** (keep `isHookedPrologue` unchanged) so it reads bytes at each resolved export address instead of `modBaseAddr`:

```ts
import { readBuffer } from '../native/memory'
import { resolveExportAddresses } from '../native/winapi'
import { formatPtr } from '../native/ptr'
import type { LiveContext, LiveFinding } from '../../../shared/types'

// isHookedPrologue stays exactly as-is (E9 / FF 25 / push-ret detection).

export const hookDetector = {
  id: 'hook',
  name: 'IAT / Inline Hook Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    // Read the first bytes at each hook-prone export's entry point in the target
    // process and flag trampoline prologues. System DLLs share a base within a
    // session, so the address resolved in our process is valid in the target.
    for (const exp of resolveExportAddresses()) {
      const bytes = readBuffer(ctx.handle, Number(exp.address), 8)
      if (bytes && isHookedPrologue(bytes)) {
        findings.push({
          detectorId: 'hook',
          detectorName: 'IAT / Inline Hook Check',
          title: 'Possible inline hook',
          detail: `Trampoline-like prologue at ${exp.module}!${exp.fn} (${formatPtr(exp.address)}).`,
          confidence: 'suspicious'
        })
      }
    }

    return findings
  }
}
```

> `readBuffer` takes a `number` address; user-mode export addresses fit in 53 bits, so `Number(exp.address)` is exact here. Keep the bigint for display via `formatPtr`.

- [ ] **Step 2: Run existing test + typecheck**

Run: `npx vitest run src/main/live/detectors/hook-detector.test.ts && npm run typecheck`
Expected: PASS (the `isHookedPrologue` tests are unaffected), no type errors.

- [ ] **Step 3: Manual verification note.** On Windows with a clean game, confirm the detector produces no findings (clean prologues); document in the PR. (A true-positive check would require an actually-hooked API and is out of scope for automated testing.)

- [ ] **Step 4: Commit**

```bash
git add src/main/live/detectors/hook-detector.ts
git commit -m "fix(live): check inline hooks at resolved export prologues, not the PE header"
```

---

# WORKSTREAM 6 — MEDIUM tier

## Task 6.1: Strict AOB token validation

**Files:**
- Modify: `src/main/live/signatures.ts:116-131`
- Create: `src/main/live/signatures.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/live/signatures.test.ts
import { describe, it, expect } from 'vitest'
import { parseAobPattern } from './signatures'

describe('parseAobPattern', () => {
  it('parses valid two-char hex bytes and wildcards', () => {
    expect(parseAobPattern('48 8B ?? 00')).toEqual([0x48, 0x8b, null, 0x00])
  })
  it('rejects single-nibble and non-hex tokens', () => {
    expect(parseAobPattern('8Z')).toBeNull()   // currently parseInt("8Z",16) === 8
    expect(parseAobPattern('8')).toBeNull()     // single nibble
    expect(parseAobPattern('48 8')).toBeNull()
    expect(parseAobPattern('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/signatures.test.ts`
Expected: FAIL — `'8Z'` and `'8'` currently parse to a byte.

- [ ] **Step 3: Edit `parseAobPattern`.** Replace the `else` branch (the `parseInt` block) with strict validation:

```ts
    } else {
      if (!/^[0-9a-fA-F]{2}$/.test(token)) return null
      bytes.push(parseInt(token, 16))
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/live/signatures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/live/signatures.ts src/main/live/signatures.test.ts
git commit -m "fix(live): reject malformed AOB tokens (require two-char hex)"
```

## Task 6.2: Region protection mask + confidence

**Files:**
- Modify: `src/main/live/detectors/injected-module-detector.ts:108-114` and `:158-167`

- [ ] **Step 1: Write the failing test.** If `injected-module-detector.test.ts` does not exist, create it; otherwise append:

```ts
import { describe, it, expect } from 'vitest'
import { isSuspiciousRegion } from './injected-module-detector'
import { EXEC_PROTECTIONS, MEM_PRIVATE } from '../native/memory'

const PAGE_GUARD = 0x100
const PAGE_EXECUTE_READ = 0x20

describe('isSuspiciousRegion', () => {
  it('matches an exec protection even with PAGE_GUARD high bits set', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE_READ | PAGE_GUARD, EXEC_PROTECTIONS)).toBe(true)
  })
  it('ignores non-private regions', () => {
    expect(isSuspiciousRegion(0, PAGE_EXECUTE_READ, EXEC_PROTECTIONS)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/detectors/injected-module-detector.test.ts`
Expected: FAIL — `PAGE_EXECUTE_READ | PAGE_GUARD` (0x120) is not in `EXEC_PROTECTIONS`.

- [ ] **Step 3: Mask the protection low byte.** Change `isSuspiciousRegion` (`:108-114`) to:

```ts
export function isSuspiciousRegion(
  regionType: number,
  regionProtect: number,
  execProtections: ReadonlySet<number>
): boolean {
  // Protection modifier bits (PAGE_GUARD 0x100, PAGE_NOCACHE 0x200, …) live above
  // the low byte; mask them off before matching the base protection constant.
  return regionType === MEM_PRIVATE && execProtections.has(regionProtect & 0xff)
}
```

- [ ] **Step 4: Lower confidence for plain private-exec regions.** In the region loop (`:158-167`), JIT engines (Mono/V8) legitimately create `MEM_PRIVATE + exec` pages, so demote those to `'info'` and reserve `'suspicious'` for writable+exec (`PAGE_EXECUTE_READWRITE` = 0x40, `PAGE_EXECUTE_WRITECOPY` = 0x80). Replace the `findings.push({...})` inside that loop with:

```ts
        const writableExec = (region.Protect & 0xff) === 0x40 || (region.Protect & 0xff) === 0x80
        findings.push({
          detectorId: 'injected-module',
          detectorName: 'Injected Module / Manual-Map Scan',
          title: 'Private executable memory region',
          detail: `MEM_PRIVATE + executable protection at ${formatPtr(toPtr(region.BaseAddress))} (size: ${region.RegionSize} bytes)` +
            (writableExec ? ' — writable+executable, possible manual-mapped code' : ' — executable private page (may be JIT/Mono)'),
          confidence: writableExec ? 'suspicious' : 'info'
        })
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/main/live/detectors/injected-module-detector.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/live/detectors/injected-module-detector.ts src/main/live/detectors/injected-module-detector.test.ts
git commit -m "fix(live): mask protection bits and downgrade JIT-like exec regions"
```

## Task 6.3: PID re-validation after open (TOCTOU)

**Files:**
- Modify: `src/main/live/live-orchestrator.ts:81-101`

- [ ] **Step 1: Re-validate the opened process exe name** before building the context. After the `if (!proc) {...}` block (ends ~`:93`), and before `const signatures = loadSignatures()`, insert a re-check that the still-open handle belongs to a process whose exe name matches `game.name`:

```ts
  // Guard against PID reuse between locate and open: confirm the opened process
  // still presents the expected executable name. listModules(pid)[0] is the main
  // module (the exe itself).
  const mainModule = listModules(game.pid)[0]
  const openedName = mainModule?.szModule ?? ''
  if (openedName && openedName.toLowerCase() !== game.name.toLowerCase()) {
    close(proc.handle)
    const f = makeStatusFinding(
      'Process changed during scan',
      `The process at PID ${game.pid} is now "${openedName}", not "${game.name}". Aborting to avoid scanning the wrong process.`
    )
    allFindings.push(f)
    emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
    emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
    return allFindings
  }
```

- [ ] **Step 2: Ensure `listModules` is imported** in `live-orchestrator.ts`. Run `grep -n "listModules" src/main/live/live-orchestrator.ts`; if absent, add it to the existing `./native/memory` import (`import { isMemoryNativeAvailable, openGameProcess, close, listModules } from './native/memory'`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/live/live-orchestrator.ts
git commit -m "fix(live): re-validate process identity after open to avoid PID reuse"
```

## Task 6.4: Tri-state update check

**Files:**
- Modify: `src/shared/types.ts:145-151` (add `checkFailed`)
- Modify: `src/main/services/github-service.ts:47-54` (discriminated result)
- Modify: `src/main/services/updater.ts:13-32`

- [ ] **Step 1: Write the failing test.** Append to `src/main/services/updater.test.ts`:

```ts
import { evaluateUpdate as evalU } from './updater'

describe('evaluateUpdate tri-state', () => {
  it('marks checkFailed when the release fetch errored', () => {
    const info = evalU('1.0.0', { status: 'error', release: null })
    expect(info.checkFailed).toBe(true)
    expect(info.updateAvailable).toBe(false)
  })
  it('reports up-to-date distinctly from a failed check', () => {
    const info = evalU('2.0.0', { status: 'ok', release: { tagName: 'v2.0.0', body: '', htmlUrl: '', publishedAt: '' } })
    expect(info.checkFailed).toBe(false)
    expect(info.updateAvailable).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/updater.test.ts`
Expected: FAIL — `evaluateUpdate` takes a `GithubRelease | null`, not a result object; `checkFailed` undefined.

- [ ] **Step 3: Add `checkFailed` to the type.** In `src/shared/types.ts`, add to `UpdateInfo` (after `updateAvailable`):

```ts
  /** True when the update check could not complete (network/rate-limit), as opposed to confirmed up-to-date. */
  checkFailed: boolean
```

- [ ] **Step 4: Return a discriminated result from `github-service.ts`.** Add a new exported function (keep `getLatestRelease` for the changelog path):

```ts
export interface ReleaseResult { status: 'ok' | 'error'; release: GithubRelease | null }

export async function getLatestReleaseResult(): Promise<ReleaseResult> {
  if (_releaseCache !== undefined && _releaseCache !== null) return { status: 'ok', release: _releaseCache }
  const { ok, status, data } = await getJson<ApiRelease>(`${BASE}/releases/latest`)
  if (!ok) {
    logger.debug('release check failed', { status })
    return { status: 'error', release: null }
  }
  const release = data
    ? { tagName: data.tag_name, body: data.body ?? '', htmlUrl: data.html_url, publishedAt: data.published_at }
    : null
  _releaseCache = release
  return { status: 'ok', release }
}
```

- [ ] **Step 5: Update `updater.ts`.** Change `evaluateUpdate` to take a `ReleaseResult` and set `checkFailed`, and `checkForUpdate` to call the new function:

```ts
import { app } from 'electron'
import { isNewer } from './semver'
import { getLatestReleaseResult, REPO, type GithubRelease, type ReleaseResult } from './github-service'
import { humanizeCommits } from './changelog'
import type { UpdateInfo } from '../../shared/types'

// notesFromRelease stays the same.

export function evaluateUpdate(currentVersion: string, result: ReleaseResult): UpdateInfo {
  if (result.status === 'error') {
    return { updateAvailable: false, checkFailed: true, currentVersion, latestVersion: null, url: null, notes: [] }
  }
  const release = result.release
  if (!release) {
    return { updateAvailable: false, checkFailed: false, currentVersion, latestVersion: null, url: null, notes: [] }
  }
  const updateAvailable = isNewer(release.tagName, currentVersion)
  return {
    updateAvailable,
    checkFailed: false,
    currentVersion,
    latestVersion: release.tagName,
    url: updateAvailable ? `https://github.com/${REPO}/releases/tag/${release.tagName}` : null,
    notes: updateAvailable ? notesFromRelease(release) : []
  }
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const result = await getLatestReleaseResult()
  return evaluateUpdate(app.getVersion(), result)
}
```

> This supersedes the URL change from Task 1.5; update the Task 1.5 `updater.test.ts` cases to pass `{ status: 'ok', release: rel('v2.0.0') }` instead of a bare release.

- [ ] **Step 6: Surface "couldn't check" in the renderer.** Run `grep -rn "checkForUpdate\|UpdateModal\|updateAvailable" src/renderer` to find the consumer (likely in a page/hook that conditionally renders `UpdateModal`). Where it currently does nothing when `!updateAvailable`, add a branch: if `info.checkFailed`, show a non-blocking toast/message using the existing toast/notification component in that file (e.g. `t('update.checkFailed')`). Add the i18n key `update.checkFailed` ("Couldn't check for updates — try again later.") to `src/renderer/locales/en.json` and its `ru.json` counterpart, matching the existing `update.*` keys.

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run src/main/services && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/services/github-service.ts src/main/services/updater.ts src/main/services/updater.test.ts src/renderer
git commit -m "feat(update): distinguish up-to-date from failed update check"
```

## Task 6.5: execFileAsync timeout

**Files:**
- Modify: `src/main/utils/async-exec.ts:114-136`

- [ ] **Step 1: Add an optional timeout parameter.** Change the `execFileAsync` signature and options:

```ts
export async function execFileAsync(
  file: string,
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<{ stdout: string; stderr: string }> {
  await acquireSlot()
  try {
    const result = await execFilePromise(file, args, {
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64, // 64 MB
      timeout: opts?.timeoutMs ?? 15000,
      killSignal: 'SIGKILL'
    })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number | string }
    logger.debug('execFileAsync non-zero exit', { file, code: execError.code, stderr: execError.stderr?.substring(0, 200) })
    return { stdout: execError.stdout ?? '', stderr: execError.stderr ?? '' }
  } finally {
    releaseSlot()
  }
}
```

> A timeout kill rejects the promise; the existing `catch` already returns partial `stdout`/`stderr`, so a slow `reg query /s` now releases its slot instead of pinning it forever.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (new param is optional; existing callers unaffected).

- [ ] **Step 3: Commit**

```bash
git add src/main/utils/async-exec.ts
git commit -m "fix(perf): add a default timeout to execFileAsync"
```

## Task 6.6: Recent-files PowerShell via stdin

**Files:**
- Modify: `src/main/scanners/recent-files-scanner.ts:26-47`

- [ ] **Step 1: Pass the `.lnk` path list via stdin instead of interpolating it into the script.** Replace the script-build + exec block (`:27-47`) so the data is read from the PowerShell input stream, not the source text. This requires `asyncExec` to support stdin; if it does not, use `execFile('powershell', [...], { input })` via a small helper. Concretely:

```ts
      // Static script: no attacker-influenced data is interpolated. The .lnk paths
      // arrive on stdin (one per line) so a crafted shortcut name can never alter
      // the script body.
      const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject WScript.Shell
$results = @{}
foreach ($p in $input) {
  $p = $p.Trim()
  if ($p) {
    try {
      $sc = $shell.CreateShortcut($p)
      if ($sc.TargetPath) { $results[$p] = $sc.TargetPath }
    } catch {}
  }
}
$results | ConvertTo-Json -Compress
`
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
      const { stdout: output } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { timeoutMs: 8000, input: lnkPaths.join('\n') }
      )
```

- [ ] **Step 2: Extend `execFileAsync` to accept `input`.** `promisify(execFile)` cannot stream stdin, so add a `spawn`-based helper in `async-exec.ts` and route `execFileAsync` through it when `opts.input` is set. Add `import { spawn } from 'child_process'` (alongside the existing child_process import) and:

```ts
function execFileWithInput(
  file: string, args: string[], input: string, timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(file, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch { /* ignore */ } }, timeoutMs)
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', () => { clearTimeout(timer); resolve({ stdout, stderr }) })
    proc.on('error', () => { clearTimeout(timer); resolve({ stdout, stderr }) })
    proc.stdin.end(input)
  })
}
```

Update the `opts` type to `opts?: { timeoutMs?: number; input?: string }` and add a branch at the top of `execFileAsync` (after `acquireSlot()`/inside the `try`) that delegates and still releases the slot:

```ts
    if (opts?.input !== undefined) {
      return await execFileWithInput(file, args, opts.input, opts.timeoutMs ?? 15000)
    }
```

- [ ] **Step 3: Update the import** in `recent-files-scanner.ts` (replace `asyncExec` usage with `execFileAsync`): change `import { asyncExec } from '../utils/async-exec'` to `import { execFileAsync } from '../utils/async-exec'`. Verify no other `asyncExec` calls remain in the file (`grep -n asyncExec src/main/scanners/recent-files-scanner.ts`); migrate any that do.

- [ ] **Step 4: Typecheck + run scanner tests**

Run: `npm run typecheck && npx vitest run src/main/scanners`
Expected: no errors; existing scanner tests pass.

- [ ] **Step 5: Manual verification note.** On Windows, run the Recent Files scan and confirm `.lnk` targets still resolve. Document in PR.

- [ ] **Step 6: Commit**

```bash
git add src/main/scanners/recent-files-scanner.ts src/main/utils/async-exec.ts
git commit -m "fix(security): feed .lnk paths to PowerShell via stdin"
```

---

# WORKSTREAM 7 — LOW tier

## Task 7.1: Re-validate settings on read

**Files:**
- Modify: `src/main/ipc-handlers.ts:18-21` (schema), `:129-133` (SETTINGS_GET handler)

- [ ] **Step 1: Add a full (defaulted) settings schema** next to `UserSettingsPartialSchema` (`:18`):

```ts
const UserSettingsSchema = z.object({
  language: z.enum(['en', 'ru']).default('en'),
  deleteAfterUse: z.boolean().default(false),
  theme: z.enum(['aurora', 'mono', 'tropical']).default('tropical')
})
```

- [ ] **Step 2: Validate on read.** Replace the `SETTINGS_GET` handler body (`:129-133`) with a parse that repairs corrupt stored settings:

```ts
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (): UserSettings => {
    const stored = appStore.get('settings')
    const parsed = UserSettingsSchema.safeParse(stored)
    if (parsed.success) return parsed.data
    logger.warn('Stored settings failed validation; using defaults', { error: parsed.error.message })
    const defaults = UserSettingsSchema.parse({})
    appStore.set('settings', defaults)
    return defaults
  })
```

- [ ] **Step 3: Confirm `logger` is imported** in `ipc-handlers.ts` (it is used at :158 already). Typecheck:

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "fix: re-validate persisted settings on read"
```

## Task 7.2: semver pre-release ordering

**Files:**
- Modify: `src/main/services/semver.ts`
- Create: `src/main/services/semver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/services/semver.test.ts
import { describe, it, expect } from 'vitest'
import { compareSemver, isNewer } from './semver'

describe('compareSemver pre-release', () => {
  it('ranks a pre-release below its release', () => {
    expect(compareSemver('1.2.0-rc.1', '1.2.0')).toBe(-1)
    expect(compareSemver('1.2.0', '1.2.0-rc.1')).toBe(1)
  })
  it('orders pre-releases lexically/numerically', () => {
    expect(compareSemver('1.2.0-rc.1', '1.2.0-rc.2')).toBe(-1)
    expect(compareSemver('1.2.0-alpha', '1.2.0-beta')).toBe(-1)
  })
  it('keeps plain release comparisons working', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(true)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/services/semver.test.ts`
Expected: FAIL — current `parts()` drops the pre-release tag, so `1.2.0-rc.1` equals `1.2.0`.

- [ ] **Step 3: Rewrite `semver.ts`** to parse and compare the pre-release tag (a release outranks any pre-release of the same core version; identifiers compared numerically when both numeric, else lexically):

```ts
interface Parsed { core: [number, number, number]; pre: string[] }

function parse(v: string): Parsed {
  const clean = v.trim().replace(/^v/i, '')
  const [main, pre = ''] = clean.split('-', 2)
  const [a, b, c] = main.split('.').map((n) => parseInt(n, 10) || 0)
  return { core: [a || 0, b || 0, c || 0], pre: pre ? pre.split('.') : [] }
}

function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1   // release > pre-release
  if (b.length === 0) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]; const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x); const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const d = parseInt(x, 10) - parseInt(y, 10)
      if (d !== 0) return d < 0 ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** -1 if a < b, 0 if equal, 1 if a > b. Leading "v" ignored; SemVer pre-release aware. */
export function compareSemver(a: string, b: string): number {
  const pa = parse(a); const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] > pb.core[i]) return 1
    if (pa.core[i] < pb.core[i]) return -1
  }
  return comparePre(pa.pre, pb.pre)
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/services/semver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/semver.ts src/main/services/semver.test.ts
git commit -m "fix(update): order pre-release versions below their release"
```

## Task 7.3: zod-parse GitHub JSON + cap changelog body

**Files:**
- Modify: `src/main/services/github-service.ts`

- [ ] **Step 1: Validate API responses with zod** instead of unchecked casts. Add at the top (after the existing imports) `import { z } from 'zod'` and schemas:

```ts
const ApiReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  html_url: z.string(),
  published_at: z.string()
})
const ApiCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string(), author: z.object({ date: z.string() }) })
})
```

- [ ] **Step 2: Apply them.** In `getRecentCommits`, replace `if (!ok || !Array.isArray(data)) return []` and the `.map` with a `z.array(ApiCommitSchema).safeParse(data)` guard. In `getLatestReleaseResult` (from Task 6.4), parse `data` with `ApiReleaseSchema.safeParse(...)` and treat a parse failure as `status: 'error'`.

- [ ] **Step 3: Cap the release body** used for changelog notes. In `getLatestReleaseResult`, when building the release object, clamp the body: `body: (data.body ?? '').slice(0, 10000)`.

- [ ] **Step 4: Typecheck + service tests**

Run: `npm run typecheck && npx vitest run src/main/services`
Expected: no errors; tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/github-service.ts
git commit -m "fix: validate GitHub API responses with zod and cap release body"
```

## Task 7.4: Cap browser-DB file size before readFileSync

**Files:**
- Modify: `src/main/scanners/browser-history-scanner.ts:280, 409, 526`

- [ ] **Step 1: Add a guarded read helper** near the top of the class (or module scope):

```ts
import { existsSync, readFileSync, statSync } from 'fs'

/** Max history-DB size we will read into memory (256 MB). */
const MAX_DB_BYTES = 256 * 1024 * 1024

function readFileCapped(p: string): Buffer | null {
  try {
    if (statSync(p).size > MAX_DB_BYTES) return null
    return readFileSync(p)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Replace each `readFileSync(tempPath)`** at `:280`, `:409`, `:526` with `readFileCapped(tempPath)` and handle the `null` case (skip that DB, continue) following the surrounding control flow. Confirm `statSync` is added to the `fs` import (Step 1 shows the full import line).

- [ ] **Step 3: Typecheck + scanner tests**

Run: `npm run typecheck && npx vitest run src/main/scanners/browser-history-scanner.test.ts`
Expected: no errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/scanners/browser-history-scanner.ts
git commit -m "fix: cap browser history DB size before reading into memory"
```

## Task 7.5: Sandbox + CSP review (investigate, then act)

**Files:**
- Modify: `src/main/index.ts:29`, `src/renderer/index.html:6`

- [ ] **Step 1: Try `sandbox: true`.** Change `index.ts:29` `sandbox: false` → `sandbox: true`. Build and run: `npm run build && npm run dev` (or `npm run debug` for a packaged dir build). Exercise the app: window controls, IPC calls (settings, scans, open external/path, update check).
- [ ] **Step 2: Decide.** If everything works (the preload uses only `contextBridge`/`ipcRenderer`, which are sandbox-compatible), keep `sandbox: true`. If the preload breaks (it does `require` of Node built-ins at top level), revert to `sandbox: false` and add a one-line comment at `:29` explaining the dependency. Either way, the outcome is intentional and documented.
- [ ] **Step 3: CSP `style-src`.** Investigate whether `'unsafe-inline'` in `index.html:6` is required (Tailwind utility classes do not need it, but runtime inline `style={{...}}` attributes — used in `UpdateModal.tsx` — do NOT count as CSP inline styles; injected `<style>` blocks do). If removing `'unsafe-inline'` leaves the UI intact in a production build (`npm run build && npm run preview`), remove it; otherwise leave it with a comment naming the dependency (e.g. a CSS-in-JS lib that injects `<style>`).
- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/renderer/index.html
git commit -m "chore(security): tighten sandbox and CSP where non-breaking"
```

## Task 7.6: AppData recursion-depth ceiling

**Files:**
- Modify: `src/main/scanners/base-scanner.ts:48-60` (the `scanFolderSync` entry point)

- [ ] **Step 1: Clamp the caller-supplied `maxDepth` to a hard ceiling.** The public `scanFolderSync` entry (`:51`) accepts a `maxDepth` that ultimately comes from scanner config (e.g. the AppData scanner); a large/negative value can drive unbounded recursion. Add a module-level constant and clamp at the entry point (the public method that calls the private recursive `scanFolderSync(path, extensions, maxDepth, 0, results)` at `:57`):

```ts
/** Hard ceiling on directory recursion regardless of caller-supplied depth. */
const MAX_SCAN_DEPTH = 12
```

In the public entry method, before the recursive call, clamp:

```ts
    const depth = Math.max(0, Math.min(maxDepth, MAX_SCAN_DEPTH))
    this.scanFolderSync(path, extensions, depth, 0, results)
```

- [ ] **Step 2: Verify the call site.** Run `grep -n "scanFolderSync\|maxDepth" src/main/scanners/base-scanner.ts` and confirm the clamp is on the public entry (depth passed as the `maxDepth` argument), not inside the recursive function (which already guards `currentDepth > maxDepth` at `:68`).

- [ ] **Step 3: Typecheck + scanner tests**

Run: `npm run typecheck && npx vitest run src/main/scanners/base-scanner.test.ts`
Expected: no errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/scanners/base-scanner.ts
git commit -m "fix: clamp directory scan recursion to a hard depth ceiling"
```

---

## Final verification

- [ ] Run the full suite: `npm test` — all green.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run lint` — clean.
- [ ] Re-read `docs/superpowers/specs/2026-06-02-security-correctness-hardening-design.md` and confirm every workstream W1–W7 has a corresponding committed change.
- [ ] Windows manual pass (items that cannot be unit-tested): W4 handle stability, W5 clean-prologue result, W6.6 `.lnk` resolution, W7.5 sandbox/CSP runtime. Record observations in the PR description.
```

## Notes for the implementer

- **memoryjs / koffi are Windows-only and lazy-loaded.** Unit tests run on macOS/Linux, so never import them eagerly at module top level and never assert on native return values in vitest — test the pure helpers (`findPatternArgs`, `ptrInRange`, `isAllowedLocalPath`, `parseAobPattern`, `compareSemver`, `isSuspiciousRegion`, `evaluateUpdate`) instead.
- **Task ordering matters within W3:** 3.1 → 3.2 → (3.3, 3.4, 3.5). Task 3.2 intentionally leaves `thread-detector.ts` not-yet-compiling until 3.3; do them back-to-back.
- **Task 6.4 supersedes Task 1.5's `updater.ts` change.** When you reach 6.4, update the 1.5 test cases to pass `{ status: 'ok', release }`.
