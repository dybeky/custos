/**
 * Detector #2 — Injected module / manual-map scan.
 *
 * Two complementary techniques:
 *  A) Module list analysis — flag DLLs not on the allowlist that match the
 *     denylist, suspicious keywords, or suspicious path patterns (temp folders,
 *     no path at all, etc.).
 *  B) Region scan — flag MEM_PRIVATE + executable regions, which indicate
 *     manually-mapped code that bypasses the module loader.
 *
 * Pure decision functions (classifyModule, isSuspiciousRegion) have no native
 * dependency and are unit-tested separately.
 */

import { listModules, listRegions, EXEC_PROTECTIONS, MEM_PRIVATE } from '../native/memory'
import type { Module, Region } from '../native/memory'
import { formatPtr, toPtr } from '../native/ptr'
import type { LiveContext, LiveFinding } from '../../../shared/types'

// ── Pure classification logic (unit-testable, no native) ─────────────────────

/** Suspicious path fragments that suggest temp/injector staging areas. */
const SUSPICIOUS_PATH_FRAGMENTS: string[] = [
  '\\temp\\',
  '\\tmp\\',
  '\\appdata\\local\\temp\\',
  '\\users\\public\\',
  '\\programdata\\',
]

/** Keyword substrings that strongly suggest a cheat module. */
const CHEAT_KEYWORDS: string[] = [
  'cheat',
  'hack',
  'aimbot',
  'triggerbot',
  'esp',
  'wallhack',
  'injector',
  'loader',
  'bypass',
  'spoof',
  'unlocker',
  'trainer',
]

export interface ModuleClassification {
  suspicious: boolean
  reason: string
  /** Localization key suffix (liveFindings.<key>) for the reason. */
  i18nKey?: string
  /** Interpolation params matching i18nKey. */
  params?: Record<string, string | number>
}

/**
 * Classify a module as suspicious or clean.
 *
 * @param moduleName  Lowercased module filename (e.g. "example.dll")
 * @param modulePath  Lowercased full path on disk (may be empty for manual maps)
 * @param allowlist   Set of lowercased known-good module names
 * @param denylist    Set of lowercased known-bad module names
 * @returns Classification or null if the module is clearly clean (on allowlist)
 */
export function classifyModule(
  moduleName: string,
  modulePath: string,
  allowlist: ReadonlySet<string>,
  denylist: ReadonlySet<string>
): ModuleClassification | null {
  const lowerName = moduleName.toLowerCase()
  const lowerPath = modulePath.toLowerCase()

  // Known-good — skip immediately
  if (allowlist.has(lowerName)) return null

  // Known-bad denylist — high confidence
  if (denylist.has(lowerName)) {
    return {
      suspicious: true,
      reason: `Module "${moduleName}" is on the denylist`,
      i18nKey: 'moduleDenylist',
      params: { module: moduleName }
    }
  }

  // Cheat keyword in module name — high confidence
  for (const kw of CHEAT_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return {
        suspicious: true,
        reason: `Module name contains cheat keyword "${kw}": ${moduleName}`,
        i18nKey: 'moduleKeyword',
        params: { keyword: kw, module: moduleName }
      }
    }
  }

  // No path → manual-map or reflective inject did not register the module name
  if (!lowerPath || lowerPath === lowerName) {
    return {
      suspicious: true,
      reason: `Module "${moduleName}" has no on-disk path (possible manual map)`,
      i18nKey: 'moduleNoPath',
      params: { module: moduleName }
    }
  }

  // Suspicious path fragment
  for (const frag of SUSPICIOUS_PATH_FRAGMENTS) {
    if (lowerPath.includes(frag)) {
      return {
        suspicious: true,
        reason: `Module loaded from suspicious path: ${modulePath}`,
        i18nKey: 'moduleSuspiciousPath',
        params: { path: modulePath }
      }
    }
  }

  // Not on allowlist but otherwise looks okay — low-signal, report as heuristic
  return { suspicious: false, reason: `Module "${moduleName}" is not on the allowlist` }
}

/**
 * True when a virtual-memory region looks like manually-mapped shellcode:
 * MEM_PRIVATE type + an executable protection flag.
 *
 * @param regionType    The `Type` field from the VirtualQueryEx region info
 * @param regionProtect The `Protect` field (current effective protection)
 * @param execProtections  Set of Win32 protection flags that include execute
 */
export function isSuspiciousRegion(
  regionType: number,
  regionProtect: number,
  execProtections: ReadonlySet<number>
): boolean {
  // Protection modifier bits (PAGE_GUARD 0x100, PAGE_NOCACHE 0x200, …) live above
  // the low byte; mask them off before matching the base protection constant.
  return regionType === MEM_PRIVATE && execProtections.has(regionProtect & 0xff)
}

// ── Detector ─────────────────────────────────────────────────────────────────

export const injectedModuleDetector = {
  id: 'injected-module',
  name: 'Injected Module / Manual-Map Scan',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []
    const allowlistSet = new Set(ctx.signatures.moduleAllowlist)
    const denylistSet = new Set(ctx.signatures.moduleDenylist)

    // ── A) Module-list analysis ──────────────────────────────────────────────
    const modules: Module[] = listModules(ctx.pid)

    for (const mod of modules) {
      const name = mod.szModule ?? ''
      const path = mod.szExePath ?? ''
      const classification = classifyModule(name, path, allowlistSet, denylistSet)

      if (!classification) continue  // Clean / on allowlist

      if (classification.suspicious) {
        // Distinguish high-confidence (denylist/keyword/no-path) from heuristic
        const isDenylist = denylistSet.has(name.toLowerCase())
        const isKeyword = CHEAT_KEYWORDS.some(kw => name.toLowerCase().includes(kw))
        const isNoPath = !path || path.toLowerCase() === name.toLowerCase()
        const confidence: LiveFinding['confidence'] =
          isDenylist || isKeyword || isNoPath ? 'high' : 'suspicious'

        findings.push({
          detectorId: 'injected-module',
          detectorName: 'Injected Module / Manual-Map Scan',
          title: 'Suspicious module detected',
          detail: classification.reason,
          confidence,
          i18nKey: classification.i18nKey,
          params: classification.params
        })
      }
    }

    // ── B) Private-executable region scan ───────────────────────────────────
    const regions: Region[] = listRegions(ctx.handle)

    for (const region of regions) {
      if (isSuspiciousRegion(region.Type, region.Protect, EXEC_PROTECTIONS)) {
        // Only PAGE_EXECUTE_READWRITE (0x40) is truly writable+executable.
        // PAGE_EXECUTE_WRITECOPY (0x80) is copy-on-write (used by legitimate
        // shared code sections), so it must not be treated as RWX.
        const writableExec = (region.Protect & 0xff) === 0x40
        findings.push({
          detectorId: 'injected-module',
          detectorName: 'Injected Module / Manual-Map Scan',
          title: 'Private executable memory region',
          detail: `MEM_PRIVATE + executable protection at ${formatPtr(toPtr(region.BaseAddress))} (size: ${region.RegionSize} bytes)` +
            (writableExec ? ' — writable+executable, possible manual-mapped code' : ' — executable private page (may be JIT/Mono)'),
          confidence: writableExec ? 'suspicious' : 'info',
          i18nKey: writableExec ? 'privateExecRwx' : 'privateExecJit',
          params: { address: formatPtr(toPtr(region.BaseAddress)), size: region.RegionSize }
        })
      }
    }

    return findings
  }
}
