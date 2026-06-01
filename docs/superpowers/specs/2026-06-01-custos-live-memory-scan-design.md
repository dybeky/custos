# Custos Live-Memory Scan — Design

**Date:** 2026-06-01
**Author:** Paulus Platov (dybekych@gmail.com)
**Status:** DRAFT — awaiting approval before implementation
**Depends on:** Custos 3.0 refactor (done), in-process native module approach (chosen)

---

## 1. What this adds

Custos today is a **forensic** scanner: it inspects Windows artifacts (files,
registry, prefetch, BAM, browser history, processes by name) for traces left by
cheats. This subsystem adds **live anti-cheat**: inspecting the **running
Unturned game process** in real time. This is standard defensive anti-cheat
(the same category as EAC/BattlEye), used by a server operator to detect
cheaters on their own machines.

The six requested live detectors:

| # | Detector | Technique | Native need |
|---|----------|-----------|-------------|
| 1 | **AOB memory signature scan** (top detector) | scan game memory for known cheat byte-patterns | `memoryjs.findPattern` |
| 2 | Injected module / manual-map scan | list loaded modules + find private executable memory regions | `memoryjs.getModules` + `getRegions` |
| 3 | Mono assembly enumeration + debugger-agent flag | detect Mono debugger-agent; enumerate managed assemblies | command-line + Mono runtime (phased) |
| 6 | Thread start-address check | flag threads starting outside legit module ranges | Win32 thread enum via `koffi` |
| 7 | IAT / inline hook check | parse game PE, compare IAT + check prologue patches | `readMemory` + PE parse |
| 8 | Self-integrity check | is Custos itself patched/suspended/debugged/in a VM | `koffi` (IsDebuggerPresent…) + existing vm-scanner |

## 2. Native layer (decided: in-process)

- **`memoryjs`** — prebuilt native Node module: `openProcess`, `getProcesses`,
  `getModules`, `getRegions`, `readMemory`, `findPattern` (AOB scanning). Covers
  #1, #2, and the memory-reads for #7.
- **`koffi`** — modern FFI to call Win32/NT APIs that memoryjs doesn't expose:
  thread enumeration (`CreateToolhelp32Snapshot`/`Thread32First` +
  `NtQueryInformationThread` for start address) for #6; `IsDebuggerPresent` /
  `CheckRemoteDebuggerPresent` for #8.
- **Admin:** the app already runs elevated (`requireAdministrator`), so
  cross-process `ReadProcessMemory` works against the game.
- **Build:** memoryjs/koffi are native → must be rebuilt for Electron's ABI.
  Add `@electron/rebuild` (already a transitive dep via electron-builder) to a
  `postinstall`/build step and stop relying on `npmRebuild: false` for these.
  CI must run on Windows (already does).

## 3. Architecture

A new **`src/main/live/`** module, separate from the forensic `scanners/`:

```
src/main/live/
  process-locator.ts   // find Unturned.exe (configurable name list), open handle
  native/
    memory.ts          // thin typed wrapper over memoryjs
    winapi.ts          // thin typed wrapper over koffi (threads, debug flags)
  detectors/
    aob-detector.ts          // #1
    injected-module-detector.ts // #2
    mono-detector.ts         // #3 (phased)
    thread-detector.ts       // #6
    hook-detector.ts         // #7
    self-integrity-detector.ts // #8
  live-orchestrator.ts // runs detectors against the located process, emits results
  signatures.ts        // loads resources/signatures.json (AOB + module rules)
```

Each detector implements a small interface:
```ts
interface LiveDetector {
  id: string
  name: string
  run(ctx: LiveContext): Promise<LiveFinding[]>   // ctx = open process handle + modules cache
}
```
The live-orchestrator mirrors the forensic orchestrator (timeout, progress,
cancellation, result events over IPC) so the renderer reuses the same result UI.

### How it relates to the game running
Live detectors require Unturned to be **running**. If `process-locator` finds no
matching process, the live scan returns a clear "game not running — start
Unturned and rescan" status (not an error). The forensic scanners are unchanged
and still run with the game closed.

## 4. Signatures & rules (`resources/signatures.json`)

```jsonc
{
  "aob": [            // #1 — byte-pattern signatures from cheat samples
    // { "name": "undead-menu", "pattern": "48 8B ?? ?? ?? ?? ?? 89", "module": "" }
  ],
  "moduleAllowlist": [ "unturned.exe", "unityplayer.dll", "mono-2.0-bdwgc.dll", ... ],
  "moduleDenylist": []  // known cheat DLL names (seeds from keywords.json)
}
```
- Starts mostly **empty** for AOB (you supply byte patterns from cheat samples,
  like you supplied the keyword list). Until then, #1 has no signatures but the
  **heuristic** detectors (#2 private-exec memory, #6 foreign threads, #7 hooks,
  #8 self-integrity) work with **no per-cheat data** — they catch *classes* of
  cheating, not specific products.
- The existing `keywords.json` names seed the module denylist and window/file
  matching already shipped.

## 5. UI

- A new **"Live Scan"** entry (its own page or a section on the Scan page) that
  shows game-detected status and runs the live detectors. Findings render in the
  existing Results UI (detections in `alert` rose).
- Capability gating: Live Scan is Windows-only and shown as unavailable with a
  clear reason on non-Windows / when the native module failed to load.

## 6. Phasing (within this subsystem)

1. **Native plumbing**: add memoryjs + koffi, electron-rebuild, `process-locator`,
   typed wrappers, `live-orchestrator`, IPC + a minimal Live Scan UI. Ship with
   **#2 (injected modules / private-exec memory)** and **#8 (self-integrity)** —
   highest value, no per-cheat data needed.
2. **#1 AOB scan** + signature loading (works as you add patterns) and **#6
   thread start-address** check.
3. **#7 IAT/inline hooks** (PE parsing) — most code, do after the framework is
   proven.
4. **#3 Mono**: start with **debugger-agent flag** + Mono module heuristics
   (easy, high-signal); defer deep managed-assembly enumeration (version-specific
   Mono runtime walking) unless needed.

## 7. Honest constraints

- **Cannot be built or tested on macOS.** memoryjs/koffi are Windows-native and
  operate on live Windows processes. All of this compiles and runs only on
  Windows with Unturned running — **you** verify it catches cheats. I'll write
  the TypeScript, structure, and tests for the pure parts (PE parsing, signature
  matching, region classification) that can be unit-tested, but the end-to-end
  proof is on your machine.
- **False positives**: heuristic detectors (private-exec memory, foreign
  threads) can flag legit anti-cheat/overlay software. Findings will be labeled
  by confidence; the AOB + denylist hits are high-confidence, heuristics are
  "suspicious, review".
- **Cheats may detect Custos**: a determined cheat can hide from user-mode
  scanning. This is user-mode anti-cheat (no kernel driver), good for catching
  common/public Unturned cheats, not a guarantee against bespoke ring-0 cheats.

## 8. Out of scope

- Kernel driver / ring-0 anti-cheat.
- Network/packet inspection.
- Auto-banning or server integration (detection only; results are shown to you).
