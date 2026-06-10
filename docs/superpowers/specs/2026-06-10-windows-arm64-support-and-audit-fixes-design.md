# Windows ARM64 Support + Audit Fixes — Design

Date: 2026-06-10
Branch: dev
Status: Approved by user

## Goal

Make Custos run natively on Windows 11 ARM and Windows 10 ARM, auto-detect the
real CPU architecture at runtime (including x64-under-emulation), and fix the
verified issues found in the full-codebase audit.

## Background

- Current builds are x64-only. Windows 10 ARM cannot run x64 binaries at all
  (it only emulates 32-bit x86), so the app is unusable there. Windows 11 ARM
  runs the x64 build under slow emulation.
- Native pieces: `memoryjs` (optionalDependency, live memory scan) and `koffi`
  (FFI, Win32 calls). Both wrappers already degrade gracefully when the native
  layer is unavailable.
- Nothing in the codebase consults the real OS architecture today.

## 1. Architecture detection — `src/main/utils/arch-utils.ts`

Single source of truth, cached after first call:

- `appArch`: architecture of this binary — `process.arch` (`x64` | `arm64` | `ia32`).
- `osArch`: real OS architecture. Detection order on Windows:
  1. `PROCESSOR_ARCHITEW6432` env var (set when the process runs under
     WOW64-style emulation; reports the real OS arch, e.g. `ARM64`).
  2. `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`
     `PROCESSOR_ARCHITECTURE` via `reg query` (not subject to per-process
     emulation lies; works on Win10 and Win11 ARM).
  3. Fallback: `os.arch()`.
- `isEmulated`: `appArch !== osArch` (e.g. x64 build on an ARM64 OS).

No native code required; pure env/registry. On non-Windows, `osArch` is
`os.arch()` and `isEmulated` is false.

`OsInfo` (shared/types.ts) gains `arch`, `appArch`, `isEmulated`. The dashboard
OS label includes the arch, e.g. `WINDOWS 11 24H2 · 26100 · ARM64`. When
`isEmulated` is true, the dashboard shows a dismissable notice: running the x64
build on an ARM PC — download `custos-arm64.exe` for full speed.

## 2. Builds + CI

- `electron-builder.yml`: `win.target.portable.arch: [x64, arm64]`, portable
  `artifactName: custos-${arch}.exe` (produces `custos-x64.exe`,
  `custos-arm64.exe`).
- `.github/workflows/build-windows.yml`: matrix over `[x64, arm64]` on
  `windows-latest`. arm64 cross-compiles on the x64 runner; electron-builder
  downloads the arm64 Electron dist and rebuilds `memoryjs` with the MSVC ARM64
  toolchain. `koffi` ships win32-arm64 prebuilds.
- `memoryjs` stays an optionalDependency: if its arm64 rebuild ever breaks, the
  exe still works and live scan reports itself unavailable. CI must not
  hard-fail the x64 artifact because of the arm64 leg (separate matrix jobs).
- `scripts/build-with-manifest.js`: pick `rcedit` binary per host arch instead
  of hardcoding `rcedit-x64.exe` (low priority; manifest path already covered
  by electron-builder `requestedExecutionLevel`).

## 3. Live scan on ARM64 (best effort, arch-gated)

- Arch-safe detectors keep running everywhere: AOB, injected-module, mono,
  thread, self-integrity (Win32 APIs are arch-agnostic; the game is x64 code
  even under emulation, so AOB signatures still match).
- `hook-detector` is x64-instruction-specific (`E9` / `FF 25` / `68…C3`
  prologue patterns) and relies on "system DLLs load at the same base across
  processes", which does not hold between an ARM64 host process and an
  x64-emulated target (ARM64X binaries contain ARM64 code at those addresses —
  bytes like 0xE9 occur by chance → phantom hook findings). Gate: when
  `appArch !== 'x64'`, skip with a visible info finding "Hook check skipped —
  instruction-pattern check is x64-only".
- `live-orchestrator` "native unavailable" message becomes arch-aware: on
  Windows ARM64 without an arm64 memoryjs build it must say the arm64 native
  module is unavailable — not "Windows only / run on a Windows machine".

## 4. Scanner robustness fixes (each verified against the code before changing)

- `vm-scanner.ts`: build driver paths from `%SystemRoot%` (`process.env.SystemRoot`,
  fallback `C:\Windows`) instead of hardcoded `C:\Windows\System32\...`.
- `config-service.ts` defaults: prefetch path from `%SystemRoot%\Prefetch`;
  Program Files paths from `%ProgramFiles%` / `%ProgramFiles(x86)%` env vars
  with literal fallbacks.
- VM-scanner registry checks and BAM drive-mapping: when the underlying
  command fails (vs. genuinely empty), surface a warning finding / `error`
  field instead of silently returning no findings.
- `process-scanner.ts`: wrap `JSON.parse` of PowerShell output in try/catch
  with fallback to the tasklist path.
- BAM / shellbags progress counters: compute progress from settled count, not
  a shared mutable counter incremented inside concurrent callbacks.
- `ipc-handlers.ts` APP_OPEN_REGISTRY: return actual success/failure of the
  `reg add` + regedit launch instead of always `{ success: true }`.

## 5. Settings + i18n completion

- Wire `Settings.tsx` to `useSettingsStore`: working theme picker (existing
  three themes), language selector (en / ru).
- Add `src/renderer/i18n/ru.json` with full translations of `en.json`.
- Register `ru` in i18n init; call `i18n.changeLanguage()` in
  `setLanguage()` and after `loadSettings()`.

## 6. Locale-robust parsing

- `scheduled-tasks-scanner.ts`: parse `schtasks` CSV by structure (quoted-field
  CSV parser, identify TaskName by leading `\`, TaskToRun by path-like
  heuristic) rather than fixed English column indices where possible; at
  minimum, never crash and log when the layout is unexpected.
- `process-scanner.ts` tasklist CSV: same quoted-field parsing (already mostly
  OK; verify against Russian-locale output shape).

## Out of scope

No new scanners, no UI redesign, no changes to detection signatures, no
code-signing.

## Testing

- Unit tests: arch-utils (env/registry parsing, emulation matrix), hook
  detector gating, CSV parsers with localized fixtures, progress computation.
- `npm run typecheck`, `lint`, `test` green before each commit.
- CI workflow validated by dispatching the build for both arches.

## Error handling principles

- A failed check must never look like a clean check: scanners surface
  command failures as warnings/errors in the result.
- Native-layer absence is a capability, not a crash: live scan reports
  exactly which piece is unavailable and why, arch-aware.
