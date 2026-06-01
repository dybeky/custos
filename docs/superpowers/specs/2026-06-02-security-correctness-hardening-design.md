# Security & Correctness Hardening Pass — Design

**Date:** 2026-06-02
**Branch base:** `dev`
**Status:** Approved (design); pending spec review → implementation plan

## Goal

Close the verified security and correctness findings from the code review of the
`custos` Electron anti-cheat scanner. Every finding below was confirmed against the
current source. Scope = **everything**: all HIGH, MEDIUM, and LOW items.

The single highest-leverage fix is the shared open-validator (W1) — it closes the only
path that turns a renderer compromise into "launch an arbitrary executable as admin." The
most impactful functional bug is the AOB module-less dispatch (W2) — the marquee detector
silently does nothing for signatures without a module.

## Approach & organization

One branch off `dev`. Work delivered as **sequenced workstreams by tier** (HIGH → MEDIUM
→ LOW), each its own commit. Recurring architectural move: **extract decision logic into
pure, exported helpers** (matching the existing `isScannablePattern` / `buildAobFinding`
test pattern in `aob-detector.ts`) so validation/range/parse logic is unit-tested without
Electron or Windows.

### Testing strategy

- Pure helpers → `vitest` unit tests (framework already in use; `npm test` = `vitest run`).
- Native-touching code (memoryjs / koffi) → tests via `vi.mock(...)` asserting call
  arity/args and cleanup; runtime Windows behaviour verified manually.
- Gates per commit: `npm test`, `npm run typecheck`, `npm run lint` all green.
- Validators **fail safe**: reject + log, never throw into an IPC handler.
- Native helpers keep the existing off-Windows degrade-to-empty/null contract.

---

## W1 — Shared open-validator (items 1, 2) — HIGH / Security

**Problem.** `APP_OPEN_EXTERNAL` (`ipc-handlers.ts:157`) passes any renderer string straight
to `shell.openExternal`. One caller feeds a network-controlled value: `UpdateModal.tsx:59`
opens `info.url` = GitHub API `html_url` (`updater.ts` → `github-service.ts:51`).
`APP_OPEN_PATH` (`ipc-handlers.ts:164-181`) expands `%ENV%`, routes anything containing `:`
(that isn't `C:\`) to `openExternal`, else to `shell.openPath` — which will launch any
path, including `C:\Windows\System32\cmd.exe` or a UNC `\\attacker\share\evil.exe`.
`setWindowOpenHandler` (`index.ts:39-42`) opens any scheme with no check, and there is no
`will-navigate` guard.

**Legitimate usage (confirmed).** `openExternal` only ever receives `https:` URLs plus
`ms-settings:…` and `windowsdefender:`. `openPath` only ever receives **directories** —
`%ENV%`-expanded or `C:\…` folders (Videos, AppData, Prefetch, Steam dirs). Never a file,
executable, or UNC.

**Fix.** New `src/main/utils/safe-open.ts`:

- `isAllowedExternalUrl(url: string): boolean` — scheme ∈ `https` ∪ matches
  `/^ms-[a-z0-9-]*$/` ∪ `windowsdefender`. Everything else rejected (`file:`, `ms-msdt:`,
  `javascript:`, arbitrary protocol handlers).
- `isAllowedLocalPath(p: string): boolean` — after `%ENV%` expansion: scheme-like strings
  (contain `:`, not drive-letter) are delegated to `isAllowedExternalUrl`; otherwise
  require drive-letter absolute (`/^[A-Za-z]:\\/`), reject UNC (`/^\\\\/`), reject
  executable extensions (`.exe .bat .cmd .com .scr .ps1 .vbs .js .jse .msi .msp .lnk .cpl
  .hta .pif .reg .jar`).
- `safeOpenExternal(url)` / `safeOpenPath(rawPath)` — thin wrappers that env-expand,
  validate via the predicates, `shell.*` on pass, `logger.warn` + drop on reject.

**Wiring.**

- `ipc-handlers.ts` `APP_OPEN_EXTERNAL` → `safeOpenExternal`; `APP_OPEN_PATH` →
  `safeOpenPath` (env-expansion + scheme routing moves into the helper).
- `index.ts` `setWindowOpenHandler` → route through `safeOpenExternal`.
- `index.ts` add a `will-navigate` listener on `webContents` that calls
  `event.preventDefault()` for any navigation away from the app origin (dev URL / packaged
  `file://` index), so the privileged bridge can't be left live on a foreign origin.
- Update URL hardening: build the release URL from `REPO` (`= 'dybeky/custos'`,
  `github-service.ts:4`) as `https://github.com/${REPO}/releases/tag/${tagName}` (fallback
  `/releases/latest`) instead of trusting `html_url`.

**Tests.** `safe-open.test.ts` — allow https / ms-settings / windowsdefender; reject
`file:`, `ms-msdt:`, `javascript:`, empty. Path: allow expanded `C:\…` dirs; reject UNC,
`.exe`/`.bat`/etc., and traversal that resolves outside a drive-letter root.

---

## W2 — AOB module-less dispatch (item 3) — HIGH / Bug

**Problem.** `memory.ts:128` always calls `m.findPattern(handle, module, pattern, flags,
offset)`. With arg types `(number, string, string, number, number)` memoryjs dispatches to
`findPatternByModule` (confirmed `node_modules/memoryjs/index.js:203`). `aob-detector.ts:29`
passes `sig.module ?? ''`, so a module-less signature asks the native layer to find a
module named `""` → never matches. The "scan all memory" path is dead.

**Fix.** In `scanPattern`, branch on module: empty ⇒ 4-arg
`m.findPattern(handle, pattern, flags, offset)` (all-memory overload); non-empty ⇒ existing
5-arg by-module call.

**Tests.** `vi.mock('memoryjs')` — assert the 4-arg overload is used for `''`/undefined
module and the 5-arg for a named module.

---

## W3 — 64-bit pointer correctness (item 4) — HIGH / Bug

**Problem.** ASLR'd x64 addresses exceed 2^53, but addresses flow through `Number()` and
double math: `thread-detector.ts:19-26`, `hook-detector.ts:30`,
`injected-module-detector.ts:164`, `winapi.ts:174`. `addr >= base && addr < base+size`
comparisons can misplace a thread → false "injected thread" / missed real one.

**Fix.** Introduce a `bigint` address convention in the live-native layer. New shared
helpers (in `safe-open.ts`'s sibling utils, e.g. `src/main/live/native/ptr.ts`):
- `ptrInRange(addr: bigint, base: bigint, size: bigint): boolean`
- `formatPtr(addr: bigint): string` (uppercase hex for finding display).

Carry module base/size and thread/hook/region addresses as `bigint`; stop the `Number()`
truncation at `winapi.ts:174` (read the koffi uint64 as `bigint`); stringify only at
finding-build time. Ripples: `thread-detector`, `hook-detector`, `injected-module-detector`,
and `aob-detector` (`buildAobFinding` address param becomes `bigint`).

**Tests.** `ptr.test.ts` — `ptrInRange` correct for bases/sizes above 2^53; `formatPtr`
round-trips a known high address. Update `aob-detector.test.ts` for the `bigint` signature.

---

## W4 — Thread-enum handle leak + INVALID_HANDLE check (item 5) — HIGH / Bug

**Problem.** `winapi.ts:162-184` closes the `CreateToolhelp32Snapshot` handle only after the
loop; any throw in the body returns via `catch` without `CloseHandle(snap)`. No
`INVALID_HANDLE_VALUE` check on the snapshot.

**Fix.** Guard `snap` against `INVALID_HANDLE_VALUE` (return `[]` if invalid); wrap the
enumeration in `try/finally` so `CloseHandle(snap)` always runs.

**Tests.** Mocked koffi api — assert `CloseHandle` is called on the snapshot even when an
inner call throws; assert early return on invalid snapshot.

---

## W5 — Inline-hook detector real prologue check (item 6) — HIGH / Bug

**Problem.** `hook-detector.ts:11-17` reads bytes at `modBaseAddr` (the PE MZ/DOS header),
not a function prologue/entry, so the prologue check can never legitimately fire.

**Decision (approved).** Properly fix — resolve real export addresses rather than demoting
to a stub.

**Fix.** Add a native helper in `winapi.ts` to resolve export addresses (koffi
`GetProcAddress` over a curated set of hook-prone APIs, e.g. `ntdll`/`kernel32` entries
relevant to the threat model). Rework `hook-detector` to read and classify the prologue at
each resolved address. Extract a pure `classifyPrologue(bytes): 'clean' | 'hooked'` helper
(detect `jmp`/`push+ret`/`mov rax;jmp` trampolines) for unit testing.

**Tests.** `hook-detector.test.ts` — `classifyPrologue` flags known trampoline byte
sequences and passes known-clean prologues. Native resolution verified manually on Windows.

---

## W6 — MEDIUM tier

- **PID reuse / TOCTOU** (`process-locator.ts` → `live-orchestrator.ts:82`): after
  `openGameProcess` by PID, re-validate the opened process's exe name matches the expected
  target before scanning; abort + log on mismatch. Surface the exe-name-only multi-match
  risk (log when >1 candidate matches).
- **AOB parse strictness** (`signatures.ts:125`): in `parseAobPattern`, validate each token
  as `/^[0-9a-fA-F]{2}$/` or `??`; reject single-nibble tokens (`8Z` currently → `0x8`).
  Test in the signatures test (or new `signatures.test.ts`).
- **Exec-protection flag bug** (`injected-module-detector.ts:108`): mask protection
  `& 0xFF` before the set lookup (so `PAGE_EXECUTE_READ | PAGE_GUARD` matches); stop
  flagging every `MEM_PRIVATE + exec` region — only flag executable **and** writable
  private regions as high-confidence, downgrade plain exec-private (JIT/Mono) to reduce
  false positives. Extract a pure `classifyRegion(protect, type, state)` helper + tests.
- **Tri-state update check** (`github-service.ts:20-33`, `updater.ts`): return a
  discriminated result (`{ status: 'update' | 'current' | 'error' }`) so a 403/rate-limit
  is distinguishable from "up to date." Map through `updater.ts`; UpdateModal/renderer shows
  a distinct "couldn't check" state. Test the mapping helper.
- **`execFileAsync` timeout** (`async-exec.ts:114`): add a timeout option (default ~15s) +
  `killSignal`; pass it to the long-running `reg query /s` calls so a huge hive can't pin a
  concurrency slot forever.
- **Recent-files PowerShell** (`recent-files-scanner.ts:28`): move attacker-influenced
  `.lnk`-name data off the command line — pass the script/data via **stdin** rather than
  interpolating into the `-EncodedCommand` payload. (Not currently injectable due to `''`
  escaping + base64, but it's the riskiest string-built command.)

---

## W7 — LOW tier

- **Settings re-validation on read**: run the existing zod schema on read; fall back to
  defaults on invalid (write path is already strict).
- **GitHub JSON cast**: zod-parse the API response instead of an unchecked cast.
- **semver pre-release ordering** (`semver.ts`): parse pre-release tags so `1.2.0-rc.1`
  sorts below `1.2.0`. Test.
- **Changelog release-body cap**: bound the rendered release body length.
- **Browser-DB size cap**: `stat` before `readFileSync`; skip files over a max size.
- **AppData recursion depth ceiling**: clamp the config-supplied depth to a hard maximum.
- **`sandbox:true`** (`index.ts:29`): attempt enabling; if the preload still works through
  `contextBridge`, ship it; otherwise document why `sandbox:false` is required.
- **CSP `style-src 'unsafe-inline'`** (`index.html`): investigate removal (nonce/hashes);
  implement if non-breaking, else document the constraint.

---

## Out of scope

Items the review explicitly verified correct are **not** changed: `self-destruct.ts`
(trusted `app.getPath('exe')` target), static SQL, symlink-skipping directory walkers,
bounded `file-hash-scanner`, strict-zod `SETTINGS_SET`, `execFile`-based `reg.exe` calls,
base64 `-EncodedCommand` shell-injection neutralization, React JSX XSS safety, and the
hardcoded-HTTPS + 8s-abort GitHub fetch.
