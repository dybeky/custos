# Windows ARM64 Support + Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Custos builds and runs natively on Windows 10/11 ARM64, auto-detects the real CPU architecture (including x64-under-emulation), arch-gates the x64-only hook detector, and fixes the verified audit findings (language support, registry-open result, hardcoded system paths).

**Architecture:** A new `arch-utils` module is the single source of truth for app/OS architecture and emulation status; `OsInfo` carries it to the renderer. electron-builder/CI produce `custos-x64.exe` and `custos-arm64.exe`. Live-scan detectors that depend on x64 instruction encoding are skipped with a visible reason on non-x64 builds.

**Tech Stack:** Electron 42 + electron-vite + electron-builder 26, TypeScript, React 19, zustand, i18next, vitest. Native: memoryjs (optionalDependency), koffi.

**Verified-and-dropped audit claims (do NOT implement):**
- `process-scanner.ts` "unguarded JSON.parse" — already inside try/catch (line 86–119).
- `scheduled-tasks-scanner.ts` CSV locale fragility — parser already handles quoted fields and uses locale-independent `\`-prefix task-name detection; schtasks CSV column *order* is locale-independent.
- BAM/shellbags `completed++` "race" — single-threaded event loop; increments happen synchronously at callback start. Semantics are "started count", which is acceptable progress UX. No fix.
- VM-scanner "silent registry failures" — reg.exe uses exit code 1 for both key-not-found and access-denied, and its stderr is localized, so the two can't be distinguished reliably; the app already requires admin (requestedExecutionLevel), making access-denied unlikely. BAM drive-mapping already logs a warning when both fallbacks fail. No fix.
- Theme picker in Settings — the pink/yellow reskin intentionally collapsed all `data-theme` variants to a single palette (`index.css`: "data-theme variants all resolve to this one palette"). Do not add a theme picker.

---

### Task 1: Architecture detection module (`arch-utils`)

**Files:**
- Create: `src/main/utils/arch-utils.ts`
- Test: `src/main/utils/arch-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/main/utils/arch-utils.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeWindowsArch, parseRegArchOutput, resolveArchInfo } from './arch-utils'

describe('normalizeWindowsArch', () => {
  it('maps Windows arch identifiers to CpuArch', () => {
    expect(normalizeWindowsArch('AMD64')).toBe('x64')
    expect(normalizeWindowsArch('amd64')).toBe('x64')
    expect(normalizeWindowsArch('ARM64')).toBe('arm64')
    expect(normalizeWindowsArch('x86')).toBe('ia32')
    expect(normalizeWindowsArch('')).toBe('unknown')
    expect(normalizeWindowsArch(undefined)).toBe('unknown')
    expect(normalizeWindowsArch('IA64')).toBe('unknown')
  })
})

describe('parseRegArchOutput', () => {
  it('extracts the arch from reg query output', () => {
    const out =
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\r\n' +
      '    PROCESSOR_ARCHITECTURE    REG_SZ    ARM64\r\n'
    expect(parseRegArchOutput(out)).toBe('arm64')
  })
  it('returns unknown for empty/garbage output', () => {
    expect(parseRegArchOutput('')).toBe('unknown')
    expect(parseRegArchOutput('ERROR: The system was unable to find the key')).toBe('unknown')
  })
})

describe('resolveArchInfo', () => {
  it('x64 app on x64 OS — not emulated', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: undefined, registryArch: 'x64' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'x64', isEmulated: false })
  })
  it('x64 app on ARM64 OS (emulated) — registry wins', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: 'ARM64', registryArch: 'arm64' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'arm64', isEmulated: true })
  })
  it('x64 app on ARM64 OS — env fallback when registry unknown', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: 'ARM64', registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'arm64', isEmulated: true })
  })
  it('native arm64 app on ARM64 OS — not emulated', () => {
    const info = resolveArchInfo({ appArch: 'arm64', platform: 'win32', envArchW6432: undefined, registryArch: 'arm64' })
    expect(info).toEqual({ appArch: 'arm64', osArch: 'arm64', isEmulated: false })
  })
  it('falls back to appArch when nothing else is known', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: undefined, registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'x64', isEmulated: false })
  })
  it('non-Windows: osArch = appArch, never emulated', () => {
    const info = resolveArchInfo({ appArch: 'arm64', platform: 'darwin', envArchW6432: undefined, registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'arm64', osArch: 'arm64', isEmulated: false })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/utils/arch-utils.test.ts`
Expected: FAIL — "Cannot find module './arch-utils'"

- [ ] **Step 3: Implement**

```ts
// src/main/utils/arch-utils.ts
import { execFileSync } from 'child_process'
import { logger } from '../services/logger'

/** Normalized CPU architecture identifiers used across the app. */
export type CpuArch = 'x64' | 'arm64' | 'ia32' | 'unknown'

export interface ArchInfo {
  /** Architecture this binary was built for (process.arch). */
  appArch: CpuArch
  /** Real architecture of the OS, even when the app runs under emulation. */
  osArch: CpuArch
  /** True when appArch !== osArch (e.g. the x64 build on a Windows-on-ARM PC). */
  isEmulated: boolean
}

/** Map Windows arch identifiers (AMD64/ARM64/x86) and Node arch names to CpuArch. */
export function normalizeWindowsArch(raw: string | undefined): CpuArch {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'AMD64':
    case 'X64':
      return 'x64'
    case 'ARM64':
      return 'arm64'
    case 'X86':
    case 'IA32':
      return 'ia32'
    default:
      return 'unknown'
  }
}

/** Extract PROCESSOR_ARCHITECTURE from `reg query` output. */
export function parseRegArchOutput(stdout: string): CpuArch {
  const m = stdout.match(/PROCESSOR_ARCHITECTURE\s+REG_\w+\s+(\S+)/i)
  return m ? normalizeWindowsArch(m[1]) : 'unknown'
}

/**
 * Pure resolution of app/OS architecture. Detection order for the OS arch on
 * Windows: machine-wide registry value (immune to per-process emulation lies),
 * then PROCESSOR_ARCHITEW6432 (set inside emulated processes), then the app's
 * own arch. Non-Windows never reports emulation.
 */
export function resolveArchInfo(input: {
  appArch: string
  platform: string
  envArchW6432: string | undefined
  registryArch: CpuArch
}): ArchInfo {
  const appArch = normalizeWindowsArch(input.appArch)

  if (input.platform !== 'win32') {
    return { appArch, osArch: appArch, isEmulated: false }
  }

  let osArch: CpuArch = 'unknown'
  if (input.registryArch !== 'unknown') {
    osArch = input.registryArch
  } else if (input.envArchW6432) {
    osArch = normalizeWindowsArch(input.envArchW6432)
  }
  if (osArch === 'unknown') osArch = appArch

  return { appArch, osArch, isEmulated: appArch !== osArch }
}

let cachedArchInfo: ArchInfo | null = null

/** Read the machine-wide PROCESSOR_ARCHITECTURE from the registry (Windows only). */
function queryRegistryArch(): CpuArch {
  try {
    const out = execFileSync(
      'reg',
      [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
        '/v',
        'PROCESSOR_ARCHITECTURE'
      ],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    )
    return parseRegArchOutput(out)
  } catch (err) {
    logger.debug('Registry arch query failed; falling back to environment', {
      error: err instanceof Error ? err.message : String(err)
    })
    return 'unknown'
  }
}

/**
 * App + OS architecture, detected once and cached. Safe to call from sync
 * code paths (single short reg.exe query on first Windows call).
 */
export function getArchInfo(): ArchInfo {
  if (cachedArchInfo) return cachedArchInfo
  cachedArchInfo = resolveArchInfo({
    appArch: process.arch,
    platform: process.platform,
    envArchW6432: process.env.PROCESSOR_ARCHITEW6432,
    registryArch: process.platform === 'win32' ? queryRegistryArch() : 'unknown'
  })
  return cachedArchInfo
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/utils/arch-utils.test.ts`
Expected: PASS (all 6+ tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/utils/arch-utils.ts src/main/utils/arch-utils.test.ts
git commit -m "feat: add CPU architecture detection with emulation awareness"
```

---

### Task 2: Surface architecture in OsInfo + dashboard label

**Files:**
- Modify: `src/shared/types.ts` (OsInfo interface, ~line 59)
- Modify: `src/main/utils/os-utils.ts` (getOsInfo, ~line 162)

- [ ] **Step 1: Extend the OsInfo type**

In `src/shared/types.ts`, replace the `OsInfo` interface with:

```ts
export interface OsInfo {
  platform: OsPlatform
  major: number
  minor: number
  build: number
  name: string          // "Windows 11" or "macOS"
  edition: string       // "24H2" or "Tahoe"
  version: string       // "11 24H2" or "26.5"
  displayName: string   // UPPERCASE label, e.g. "WINDOWS 11 24H2 · 26100 · ARM64"
  isWindows11: boolean
  /** Real OS CPU architecture ('x64' | 'arm64' | 'ia32' | 'unknown'). */
  arch: string
  /** Architecture this Custos binary was built for. */
  appArch: string
  /** True when the app runs under emulation (e.g. x64 build on Windows-on-ARM). */
  isEmulated: boolean
}
```

- [ ] **Step 2: Wire arch-utils into getOsInfo**

In `src/main/utils/os-utils.ts`:

Add import at top:
```ts
import { getArchInfo } from './arch-utils'
```

In the `platform === 'windows'` branch of `getOsInfo()`, replace the `cachedOsInfo =` assignment with:

```ts
    const archInfo = getArchInfo()
    const archLabel = archInfo.osArch === 'unknown' ? '' : ` · ${archInfo.osArch}`
    cachedOsInfo = {
      platform,
      major: v.major,
      minor: v.minor,
      build: v.build,
      name,
      edition,
      version,
      displayName: `${v.build ? `${label} · ${v.build}` : label}${archLabel}`.toUpperCase(),
      isWindows11: isWin11,
      arch: archInfo.osArch,
      appArch: archInfo.appArch,
      isEmulated: archInfo.isEmulated
    }
```

In the macOS branch, add to the object literal:
```ts
      arch: getArchInfo().osArch,
      appArch: getArchInfo().appArch,
      isEmulated: false
```

In the Linux/unknown fallback, add:
```ts
    arch: getArchInfo().osArch,
    appArch: getArchInfo().appArch,
    isEmulated: false
```

- [ ] **Step 3: Typecheck and run full tests**

Run: `npm run typecheck && npm run test`
Expected: PASS — no other code constructs OsInfo literals (verify with `grep -rn "isWindows11:" src/` — only os-utils.ts should construct them; fix any test fixtures that break).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/main/utils/os-utils.ts
git commit -m "feat: expose real OS architecture and emulation status in OsInfo"
```

---

### Task 3: Arch-gate the inline-hook detector

**Files:**
- Modify: `src/main/live/detectors/hook-detector.ts`
- Test: `src/main/live/detectors/hook-detector.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/main/live/detectors/hook-detector.test.ts`:

```ts
import { isHookCheckSupported } from './hook-detector'

describe('isHookCheckSupported', () => {
  it('only supports x64 builds (patterns are x64 instruction encodings)', () => {
    expect(isHookCheckSupported('x64')).toBe(true)
    expect(isHookCheckSupported('arm64')).toBe(false)
    expect(isHookCheckSupported('ia32')).toBe(false)
  })
})
```

(Adjust the import line to merge with the existing import from './hook-detector'.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/live/detectors/hook-detector.test.ts`
Expected: FAIL — isHookCheckSupported is not exported

- [ ] **Step 3: Implement the gate**

In `src/main/live/detectors/hook-detector.ts`, add after `isHookedPrologue`:

```ts
/**
 * The prologue patterns above are x64 instruction encodings, and the
 * same-base-address assumption only holds when Custos and the target run the
 * same architecture. On an ARM64 build, system DLLs are ARM64X images whose
 * code bytes can match these patterns by chance — phantom hook findings.
 */
export function isHookCheckSupported(appArch: string): boolean {
  return appArch === 'x64'
}
```

At the top of `run(ctx)` (before `resolveExportAddresses()`), add:

```ts
    if (!isHookCheckSupported(process.arch)) {
      return [{
        detectorId: 'hook',
        detectorName: 'IAT / Inline Hook Check',
        title: 'Hook check skipped',
        detail: `Inline-hook detection uses x64 instruction patterns and is skipped on ${process.arch} builds to avoid false positives.`,
        confidence: 'info'
      }]
    }
```

- [ ] **Step 4: Run tests, typecheck**

Run: `npx vitest run src/main/live/detectors/hook-detector.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/live/detectors/hook-detector.ts src/main/live/detectors/hook-detector.test.ts
git commit -m "feat(live): skip x64-only hook detector on non-x64 builds"
```

---

### Task 4: Arch-aware live-scan availability messaging

**Files:**
- Modify: `src/shared/types.ts` (LiveScanStatus)
- Modify: `src/main/live-ipc.ts:34-39`
- Modify: `src/main/live/live-orchestrator.ts:55-65`
- Modify: `src/renderer/pages/LiveScan.tsx:140`
- Modify: `src/renderer/i18n/en.json` (liveScan.nativeUnavailableDesc)

- [ ] **Step 1: Add arch to LiveScanStatus**

In `src/shared/types.ts`, add to the `LiveScanStatus` interface:

```ts
  /** Architecture of this Custos binary (process.arch), for support messaging. */
  arch: string
```

In `src/main/live-ipc.ts`, add `arch: process.arch,` to the returned object in the LIVE_GET_STATUS handler:

```ts
    return {
      nativeAvailable,
      platform: process.platform,
      arch: process.arch,
      gameRunning: game !== null,
      gameName: game?.name
    }
```

- [ ] **Step 2: Arch-aware orchestrator status finding**

In `src/main/live/live-orchestrator.ts`, replace the native-availability block (step 1) with:

```ts
  // ── 1. Native availability ────────────────────────────────────────────────
  if (!isMemoryNativeAvailable()) {
    const onWindows = process.platform === 'win32'
    const f = onWindows
      ? makeStatusFinding(
          `Native module unavailable (${process.arch} build)`,
          'Live memory scanning requires the memoryjs native addon, which did not ' +
          `load in this ${process.arch} build. ` +
          (process.arch === 'arm64'
            ? 'If this persists, run the x64 build (custos-x64.exe) on Windows 11 ARM, where it works under emulation.'
            : 'Try re-downloading the latest release.')
        )
      : makeStatusFinding(
          'Native module unavailable (Windows only)',
          'Live memory scanning requires the memoryjs native addon, which is only ' +
          'available on Windows. Run Custos on a Windows machine to use this feature.'
        )
    allFindings.push(f)
    emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
    emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
    return allFindings
  }
```

- [ ] **Step 3: Renderer message uses the arch**

In `src/renderer/i18n/en.json`, change:

```json
    "nativeUnavailableDesc": "The live-scan native module didn't load in this {{arch}} build"
```

In `src/renderer/pages/LiveScan.tsx` (nativeAvailable-false branch, line ~140), change the description line to:

```tsx
            <p className="text-xs text-ink-dim mt-0.5">{t('liveScan.nativeUnavailableDesc', { arch: status.arch })}</p>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/live-ipc.ts src/main/live/live-orchestrator.ts src/renderer/pages/LiveScan.tsx src/renderer/i18n/en.json
git commit -m "feat(live): arch-aware native-module availability messaging"
```

---

### Task 5: Remove hardcoded system paths (vm-scanner, config defaults)

**Files:**
- Modify: `src/main/scanners/vm-scanner.ts:17-54`
- Modify: `src/main/services/config-service.ts:200-206`

- [ ] **Step 1: vm-scanner — derive from SystemRoot**

In `src/main/scanners/vm-scanner.ts`, insert above `VM_GUEST_DRIVERS`:

```ts
// Resolve the real Windows directory — works on any system drive and on
// Windows-on-ARM (where the app may run emulated but SystemRoot is real).
const SYSTEM_ROOT = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
const sys32 = (rel: string): string => `${SYSTEM_ROOT}\\System32\\${rel}`
```

Replace every literal `'C:\\Windows\\System32\\drivers\\X'` with `` sys32('drivers\\X') `` and `'C:\\Windows\\System32\\X'` with `` sys32('X') ``. Result:

```ts
const VM_GUEST_DRIVERS: Record<string, string[]> = {
  VMware: [
    sys32('drivers\\vmci.sys'),
    sys32('drivers\\vmmouse.sys'),
    sys32('drivers\\vmhgfs.sys'),
    sys32('drivers\\vmusbmouse.sys'),
    sys32('drivers\\vmx_svga.sys'),
    sys32('drivers\\vmxnet.sys')
  ],
  VirtualBox: [
    sys32('drivers\\VBoxGuest.sys'),
    sys32('drivers\\VBoxMouse.sys'),
    sys32('drivers\\VBoxSF.sys'),
    sys32('drivers\\VBoxVideo.sys'),
    sys32('VBoxControl.exe'),
    sys32('VBoxTray.exe')
  ],
  'QEMU/KVM': [
    sys32('drivers\\vioscsi.sys'),
    sys32('drivers\\viostor.sys'),
    sys32('drivers\\vioinput.sys'),
    sys32('drivers\\vioser.sys'),
    sys32('drivers\\balloon.sys')
  ],
  Parallels: [
    sys32('drivers\\prl_fs.sys'),
    sys32('drivers\\prl_pv32.sys'),
    sys32('drivers\\prl_boot.sys')
  ],
  Xen: [
    sys32('drivers\\xenbus.sys'),
    sys32('drivers\\xenvbd.sys'),
    sys32('drivers\\xenvif.sys')
  ],
  Sandboxie: [
    sys32('drivers\\SbieDrv.sys')
  ]
}
```

- [ ] **Step 2: config-service defaults from environment**

In `src/main/services/config-service.ts` `getDefaultConfig()`, replace the `paths.windows` block:

```ts
      paths: {
        windows: {
          prefetchPath: `${process.env.SystemRoot ?? 'C:\\Windows'}\\Prefetch`,
          windowsPath: process.env.SystemRoot ?? 'C:\\Windows',
          programFilesX86: process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
          programFiles: process.env.ProgramFiles ?? 'C:\\Program Files'
        },
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test`
Expected: PASS. Also check no other hardcoded System32 paths remain: `grep -rn "C:\\\\\\\\Windows" src/main/ --include="*.ts" | grep -v test` — remaining hits should only be fallback defaults.

- [ ] **Step 4: Commit**

```bash
git add src/main/scanners/vm-scanner.ts src/main/services/config-service.ts
git commit -m "fix: derive Windows system paths from environment instead of hardcoding C:"
```

---

### Task 6: APP_OPEN_REGISTRY reports real success/failure

**Files:**
- Modify: `src/main/ipc-handlers.ts:185-225`

- [ ] **Step 1: Replace the fire-and-forget handler**

Add to imports at top of `src/main/ipc-handlers.ts`:

```ts
import { promisify } from 'util'
```

(`execFile` is already imported.) Below the imports add:

```ts
const execFileP = promisify(execFile)
```

Replace the APP_OPEN_REGISTRY handler body (keep the existing validation and HKCU/HKLM expansion) so the LastKey write is awaited and failures are reported:

```ts
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_REGISTRY, async (_event, keyPath: string): Promise<{ success: boolean; error?: string }> => {
    // Validate keyPath. Reject leading/trailing backslashes — a path must be a
    // hive root followed by backslash-separated segments, never an empty segment.
    if (!keyPath || !/^[A-Za-z0-9\\_\-\s.(){}]+$/.test(keyPath) || keyPath.startsWith('\\') || keyPath.endsWith('\\')) {
      return { success: false, error: 'Invalid registry key path' }
    }

    const expandedKeyPath = keyPath
      .replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\')
      .replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\')
      .replace(/^HKU\\/i, 'HKEY_USERS\\')
      .replace(/^HKCR\\/i, 'HKEY_CLASSES_ROOT\\')
      .replace(/^HKCC\\/i, 'HKEY_CURRENT_CONFIG\\')

    try {
      // Point regedit's "last opened key" at the target, then launch it.
      await execFileP('reg', [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit',
        '/v', 'LastKey',
        '/t', 'REG_SZ',
        '/d', expandedKeyPath,
        '/f'
      ], { timeout: 5000, windowsHide: true })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.debug('Failed to write regedit LastKey', { error: msg })
      return { success: false, error: 'Could not prepare regedit' }
    }

    // regedit stays open until the user closes it, so only spawn errors are
    // observable — report those, otherwise assume the launch succeeded.
    execFile('regedit.exe', (launchError) => {
      if (launchError) {
        logger.debug('Failed to launch regedit', { error: launchError.message })
      }
    })
    return { success: true }
  })
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. Check the renderer caller handles `success: false` (grep `openRegistry` in src/renderer — Manual.tsx already shows `registryKeyNotFound` on failure).

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "fix: report real success/failure when opening registry keys"
```

---

### Task 7: Complete the language feature (ru locale + selector)

**Files:**
- Create: `src/renderer/i18n/ru.json`
- Modify: `src/renderer/i18n/index.ts`
- Modify: `src/renderer/stores/settings-store.ts`
- Modify: `src/renderer/pages/Settings.tsx`
- Modify: `src/renderer/i18n/en.json` (palette label fix only if needed)

- [ ] **Step 1: Create ru.json**

Create `src/renderer/i18n/ru.json` mirroring every key of `en.json` (translate all sections: settings, dashboard, scan, manual, utilities, general, results, header, errorBoundary, nav, gamePicker, update, promo, liveScan — keep `{{version}}`, `{{name}}`, `{{arch}}` placeholders intact). Translation content (complete file):

```json
{
  "settings": {
    "title": "Настройки",
    "subtitle": "Настройка параметров custos",
    "appearance": "Оформление",
    "paletteDesc": "Custos использует единую пастельную палитру во всём интерфейсе.",
    "about": "О программе",
    "version": "Версия:",
    "developer": "Разработчик:",
    "viewOnGitHub": "ОТКРЫТЬ НА GITHUB",
    "language": "Язык",
    "languageDesc": "Выберите язык интерфейса"
  },
  "dashboard": {
    "title": "Главная",
    "eyebrow": "АНТИЧИТ-ИНСТРУМЕНТАРИЙ",
    "welcome": "Добро пожаловать",
    "welcomeMessage": "Быстрое обнаружение стороннего ПО.",
    "version": "Версия",
    "stable": "СТАБИЛЬНАЯ",
    "compatibility": "Совместимость системы",
    "compatibilitySubtitle": "Проверки, доступные в вашей системе",
    "available": "доступно",
    "ready": "Готово",
    "unavailable": "Недоступно",
    "allChecksAvailable": "Все проверки доступны в вашей системе",
    "someChecksUnavailable": "Некоторые проверки не поддерживаются этой системой",
    "categoryScan": "Сканирование",
    "categoryManual": "Ручная проверка",
    "categoryUtilities": "Утилиты",
    "categoryExport": "Результаты и экспорт",
    "changelog": "Что нового",
    "changelogEmpty": "Не удалось загрузить список изменений.",
    "autoDetected": "Определено автоматически",
    "emulatedTitle": "Запущено в режиме эмуляции",
    "emulatedDesc": "Этот компьютер — {{arch}}, но запущена x64-версия. Скачайте custos-{{arch}}.exe для полной скорости."
  },
  "scan": {
    "title": "Сканирование",
    "startScan": "НАЧАТЬ СКАНИРОВАНИЕ",
    "readyToScan": "Готово к сканированию",
    "scanning": "Сканирование...",
    "scanningSubtitle": "Подождите, идёт проверка системы...",
    "scanComplete": "Сканирование завершено",
    "cancelScan": "ОТМЕНИТЬ",
    "scanDescription": "Сканирование AppData, реестра, процессов, Prefetch, Steam и не только",
    "scannersReady": "сканеров готово",
    "progress": "Прогресс:",
    "complete": "Готово!",
    "pending": "Ожидание",
    "found": "найдено"
  },
  "manual": {
    "title": "Ручная проверка",
    "subtitle": "Открывайте папки и инструменты вручную для расследования",
    "systemTools": "Системные инструменты",
    "folders": "Папки",
    "games": "Игры",
    "registry": "Реестр",
    "telegramCheatBots": "Telegram-боты с читами",
    "telegramBotsDesc": "Откройте этих ботов, чтобы проверить, взаимодействовал ли с ними пользователь",
    "additionalResources": "Дополнительные ресурсы",
    "additionalResourcesDesc": "Сайты, где обычно продают читы",
    "dataUsage": "Использование данных",
    "videos": "Видео",
    "downloads": "Загрузки",
    "registryKeyNotFound": "Ключ реестра отсутствует в этой системе"
  },
  "utilities": {
    "title": "Утилиты",
    "subtitle": "Полезные инструменты для античит-проверки",
    "openWebsite": "ОТКРЫТЬ САЙТ",
    "lastActivityViewDesc": "Показывает действия на компьютере, включая запуск программ и открытие файлов.",
    "usbDeviewDesc": "Список всех USB-устройств, когда-либо подключавшихся к компьютеру.",
    "everythingDesc": "Мгновенный поиск файлов по имени для Windows.",
    "systemInformerDesc": "Бесплатный многоцелевой инструмент для мониторинга ресурсов системы и отладки ПО.",
    "shellbagAnalyzerDesc": "Анализирует и очищает записи ShellBag, оставленные просмотром папок."
  },
  "general": {
    "home": "Главная",
    "checkUpdates": "Проверить обновления",
    "noReleases": "Релизы на GitHub не найдены",
    "error": "Ошибка",
    "networkUnavailable": "Сеть недоступна",
    "timeout": "Тайм-аут"
  },
  "results": {
    "title": "Результаты",
    "clean": "Чисто",
    "suspicious": "Подозрительно",
    "filesScanned": "Файлов проверено",
    "noThreatsFound": "Угроз не найдено",
    "threatsFound": "угроз найдено",
    "scanResults": "Результаты сканирования",
    "exportResults": "ЭКСПОРТ РЕЗУЛЬТАТОВ",
    "exportJSON": "ЭКСПОРТ JSON",
    "runScanToSee": "Запустите сканирование, чтобы увидеть результаты",
    "noResultsYet": "Результатов пока нет"
  },
  "header": {
    "allSystemsOk": "Все системы в норме",
    "warningDetected": "Обнаружено предупреждение",
    "errorDetected": "Обнаружена ошибка"
  },
  "errorBoundary": {
    "title": "Что-то пошло не так",
    "message": "Произошла непредвиденная ошибка. Попробуйте перезагрузить приложение.",
    "reload": "Перезагрузить приложение",
    "continue": "Продолжить"
  },
  "nav": {
    "dashboard": "Главная",
    "scan": "Сканирование",
    "liveScan": "Live-сканирование",
    "results": "Результаты",
    "manual": "Ручная проверка",
    "utilities": "Утилиты",
    "settings": "Настройки"
  },
  "gamePicker": {
    "title": "Выберите игру",
    "subtitle": "custos подстраивает проверки под выбранную игру.",
    "comingSoon": "Скоро",
    "select": "Выбрать"
  },
  "update": {
    "title": "Доступно обновление",
    "newVersion": "Доступна версия {{version}}",
    "download": "Скачать",
    "later": "Позже",
    "checkFailed": "Не удалось проверить обновления — попробуйте позже."
  },
  "promo": {
    "title": "Создано 97437",
    "body": "Инструменты, моды и не только — заходите.",
    "visit": "Открыть 97437.dev"
  },
  "liveScan": {
    "title": "Live-сканирование",
    "subtitle": "Сканирование памяти процесса Unturned в реальном времени",
    "startScan": "НАЧАТЬ LIVE-СКАН",
    "scanAgain": "СКАНИРОВАТЬ СНОВА",
    "scanning": "Сканирование...",
    "scanComplete": "Сканирование завершено",
    "checkingStatus": "Проверка статуса...",
    "refreshStatus": "Обновить статус",
    "windowsOnly": "Только Windows",
    "windowsOnlyDesc": "Live-сканирование памяти доступно только в Windows",
    "nativeUnavailable": "Нативный модуль недоступен",
    "nativeUnavailableDesc": "Нативный модуль live-сканирования не загрузился в этой сборке ({{arch}})",
    "gameNotRunning": "Unturned не запущен",
    "gameNotRunningDesc": "Запустите игру, затем начните сканирование",
    "gameDetected": "Unturned обнаружен — готов к сканированию",
    "gameDetectedDesc": "Обнаружено: {{name}}",
    "readyToScan": "Готов к сканированию",
    "confidenceHigh": "ВЫСОКАЯ",
    "confidenceSuspicious": "ПОДОЗРИТЕЛЬНО",
    "confidenceInfo": "ИНФО",
    "highThreats": "критических",
    "suspicious": "подозрительных",
    "noThreatsFound": "Активных угроз не обнаружено",
    "noLiveThreats": "Активных угроз не обнаружено",
    "noLiveThreatsDesc": "Память процесса выглядит чистой"
  }
}
```

Note: `dashboard.emulatedTitle`/`emulatedDesc` and the updated `liveScan.nativeUnavailableDesc` are referenced by Tasks 4 and 8 — en.json gets its `emulatedTitle`/`emulatedDesc` keys in Task 8. Order within this task: also verify en.json already contains every key used here.

- [ ] **Step 2: Register ru and wire language switching**

Replace `src/renderer/i18n/index.ts`:

```ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

export default i18n
```

In `src/renderer/stores/settings-store.ts`:

Add import:
```ts
import i18n from '../i18n'
```

Change `setLanguage`:
```ts
  setLanguage: (value) => {
    set({ language: value })
    i18n.changeLanguage(value)
    get().saveSettings()
  },
```

In `loadSettings`, after computing `theme` and before `set({...})`, add:
```ts
      const language = settings.language === 'ru' ? 'ru' : 'en'
      i18n.changeLanguage(language)
```
and use `language` in the `set()` call instead of `settings.language`.

- [ ] **Step 3: Language selector in Settings + palette display cleanup**

Replace `src/renderer/pages/Settings.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { useSettingsStore } from '../stores/settings-store'

// The single brand palette (see index.css design tokens).
const PALETTE = [
  { hex: '#FFB3C6', name: 'Lavender' },
  { hex: '#FFF48D', name: 'Lemon' },
  { hex: '#FF678B', name: 'Pink' },
  { hex: '#ffc24b', name: 'Amber' }
]

const LANGUAGES: Array<{ id: 'en' | 'ru'; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' }
]

export function Settings() {
  const { t } = useTranslation()
  const { language, setLanguage } = useSettingsStore()

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink font-display">{t('settings.title')}</h1>
          <p className="text-ink-dim mt-1">{t('settings.subtitle')}</p>
        </div>

        {/* Language */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.languageDesc')}</p>
            <div className="flex gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setLanguage(lang.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    language === lang.id
                      ? 'bg-scan/10 text-scan border-scan/40'
                      : 'text-ink-dim border-[color:var(--line)] hover:text-ink hover:bg-panel-2'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Appearance — single palette showcase */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-dim mb-4">{t('settings.paletteDesc')}</p>
            <div className="grid grid-cols-4 gap-3">
              {PALETTE.map((c) => (
                <div key={c.name} className="flex flex-col items-center gap-2">
                  <div
                    className="w-full h-12 rounded-xl border border-[color:var(--line)]"
                    style={{ background: c.hex, boxShadow: `0 0 16px ${c.hex}55` }}
                  />
                  <span className="text-2xs font-mono text-ink-dim">{c.hex}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

(This also fixes the duplicated `#FFF48D` swatch / mismatched names in the old list.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS. Manually: `npm run dev` if on a desktop — switching language should re-render all visible strings instantly.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/i18n/ru.json src/renderer/i18n/index.ts src/renderer/stores/settings-store.ts src/renderer/pages/Settings.tsx
git commit -m "feat: complete Russian localization with working language selector"
```

---

### Task 8: Emulation notice on Dashboard

**Files:**
- Modify: `src/renderer/i18n/en.json` (dashboard section)
- Modify: `src/renderer/pages/Dashboard.tsx` (insert before the System Compatibility card, ~line 247)

- [ ] **Step 1: Add en keys**

In `src/renderer/i18n/en.json` `dashboard` section, add:

```json
    "emulatedTitle": "Running under emulation",
    "emulatedDesc": "This PC is {{arch}}, but you're running the x64 build. Download custos-{{arch}}.exe for full speed."
```

(ru.json already has these from Task 7.)

- [ ] **Step 2: Insert the notice card**

In `src/renderer/pages/Dashboard.tsx`, directly above the `{/* System Compatibility Card */}` comment, insert:

```tsx
        {/* Emulation notice — x64 build running on an ARM PC */}
        {osInfo?.isEmulated && (
          <Card className="mt-4 border-amber/30">
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-amber font-display">{t('dashboard.emulatedTitle')}</p>
                  <p className="text-xs text-ink-dim mt-0.5">{t('dashboard.emulatedDesc', { arch: osInfo.arch })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
```

(`osInfo` and `t` are already in scope; `Card`/`CardContent` already imported.)

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS

```bash
git add src/renderer/pages/Dashboard.tsx src/renderer/i18n/en.json
git commit -m "feat(ui): warn when the x64 build runs emulated on an ARM PC"
```

---

### Task 9: Build both x64 and arm64 artifacts

**Files:**
- Modify: `electron-builder.yml:22-33`
- Modify: `.github/workflows/build-windows.yml`
- Modify: `scripts/build-with-manifest.js:31-32`

- [ ] **Step 1: electron-builder targets + per-arch artifact name**

In `electron-builder.yml` replace the `win:` and `portable:` sections:

```yaml
win:
  target:
    - target: portable
      arch:
        - x64
        - arm64
  icon: resources/icon.ico
  requestedExecutionLevel: requireAdministrator
  signAndEditExecutable: false

portable:
  artifactName: custos-${arch}.exe
  requestExecutionLevel: admin
```

- [ ] **Step 2: CI matrix**

Replace `.github/workflows/build-windows.yml`:

```yaml
name: Build Windows .exe
on:
  workflow_dispatch:
jobs:
  package:
    runs-on: windows-latest
    strategy:
      fail-fast: false
      matrix:
        arch: [x64, arm64]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npx electron-builder --win --${{ matrix.arch }}
      - uses: actions/upload-artifact@v4
        with:
          name: custos-windows-${{ matrix.arch }}
          path: release/custos-${{ matrix.arch }}.exe
          if-no-files-found: error
```

Known risk: the arm64 leg rebuilds `memoryjs` with the MSVC ARM64 toolchain (present on windows-latest). If that rebuild fails, the arm64 job fails *without* affecting x64 (`fail-fast: false`). Fallback if it ever fails: add a step before packaging that removes the optional dep for arm64 only (`if: matrix.arch == 'arm64'` → `npm uninstall memoryjs --no-save`); the live-scan wrapper degrades gracefully and now explains itself arch-aware (Task 4).

- [ ] **Step 3: rcedit per-arch in build-with-manifest.js**

In `scripts/build-with-manifest.js` replace the two rcedit path lines:

```js
// rcedit-x64.exe runs on x64 hosts; the x86 rcedit.exe runs everywhere else
// (including Windows-on-ARM via built-in x86 emulation).
const rceditBin = process.arch === 'x64' ? 'rcedit-x64.exe' : 'rcedit.exe';
const globalRcedit = path.join(process.env.APPDATA || '', `npm/node_modules/rcedit/bin/${rceditBin}`);
const localRcedit = path.join(__dirname, `../node_modules/rcedit/bin/${rceditBin}`);
```

- [ ] **Step 4: Verify what's verifiable locally**

Run: `npm run typecheck && npm run test`
Expected: PASS. The yml/workflow changes themselves are validated by dispatching the workflow in Task 10 — that's the real test for cross-arch packaging.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml .github/workflows/build-windows.yml scripts/build-with-manifest.js
git commit -m "feat(build): produce native arm64 and x64 Windows portables"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full local gate**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all PASS, zero warnings introduced.

- [ ] **Step 2: Build smoke test (renderer+main bundle only — packaging needs Windows)**

Run: `npm run build`
Expected: electron-vite build completes without errors.

- [ ] **Step 3: Push and dispatch CI**

```bash
git push origin dev
gh workflow run "Build Windows .exe" --ref dev
gh run watch
```

Expected: both matrix jobs green; artifacts `custos-windows-x64` and `custos-windows-arm64`. If the arm64 job fails on memoryjs rebuild, apply the documented fallback step from Task 9 and re-dispatch.
