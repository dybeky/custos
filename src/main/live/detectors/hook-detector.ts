import { listModules, readBuffer } from '../native/memory'
import { resolveExportAddresses, type ResolvedExport } from '../native/winapi'
import { formatPtr } from '../native/ptr'
import type { LiveContext, LiveFinding } from '../../../shared/types'

/**
 * Detect a hooked function prologue from its first bytes.
 *  - E9 xx xx xx xx            near jmp (relative)
 *  - FF 25 xx xx xx xx         indirect jmp [rip+disp]
 *  - 68 xx xx xx xx C3         push imm32 ; ret  (push/ret trampoline)
 * Pure + unit-tested; no native dependency.
 */
export function isHookedPrologue(bytes: Buffer): boolean {
  if (bytes.length === 0) return false
  if (bytes[0] === 0xe9 && bytes.length >= 5) return true
  if (bytes[0] === 0xff && bytes.length >= 2 && bytes[1] === 0x25) return true
  if (bytes[0] === 0x68 && bytes.length >= 6 && bytes[5] === 0xc3) return true
  return false
}

/** A module mapped in the target process, as reported by listModules(). */
export interface TargetModuleRange {
  name: string
  base: number
  size: number
}

/**
 * Keep only the exports (resolved at addresses in *our* process) that are
 * actually valid to read in the *target*: the owning module must be loaded in
 * the target at a base where the resolved address falls inside its mapped
 * range. This is the precondition for ReadProcessMemory to succeed.
 *
 * It matters because memoryjs.readBuffer does not signal a failed read — on a
 * failed ReadProcessMemory it returns a buffer of *uninitialised process heap*
 * rather than null. Reading an address that is not valid in the target (the
 * module is a different bitness/base, not loaded, or unmapped) would therefore
 * feed garbage to isHookedPrologue and produce phantom "inline hook" findings.
 * Restricting reads to in-range addresses keeps us on the success path.
 */
export function exportsValidInTarget(
  exports: ResolvedExport[],
  targetModules: TargetModuleRange[]
): ResolvedExport[] {
  const byName = new Map<string, TargetModuleRange>()
  for (const m of targetModules) byName.set(m.name.toLowerCase(), m)
  return exports.filter((exp) => {
    const mod = byName.get(exp.module.toLowerCase())
    if (!mod) return false
    const base = BigInt(mod.base)
    const end = base + BigInt(mod.size)
    return exp.address >= base && exp.address < end
  })
}

export const hookDetector = {
  id: 'hook',
  name: 'IAT / Inline Hook Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    const resolved = resolveExportAddresses()
    if (resolved.length === 0) return findings // non-Windows / native unavailable

    // Validate each resolved export against the TARGET's loaded modules. Only
    // addresses that fall inside a module actually mapped in the target are read
    // — otherwise memoryjs.readBuffer would return uninitialised heap on the
    // failed read and yield phantom hook findings (see exportsValidInTarget).
    const targetModules: TargetModuleRange[] = listModules(ctx.pid).map((m) => ({
      name: m.szModule,
      base: m.modBaseAddr,
      size: m.modBaseSize
    }))

    if (targetModules.length === 0) {
      // Can't confirm where modules are mapped in the target — skip rather than
      // read at unverified addresses and risk false positives.
      findings.push({
        detectorId: 'hook',
        detectorName: 'IAT / Inline Hook Check',
        title: 'Hook check skipped',
        detail: 'Could not enumerate the target process modules, so export addresses could not be validated against it. Skipped to avoid false positives.',
        confidence: 'info'
      })
      return findings
    }

    // Read the first bytes at each validated hook-prone export's entry point in
    // the target process and flag trampoline prologues.
    for (const exp of exportsValidInTarget(resolved, targetModules)) {
      // Safe to narrow the bigint to Number for memoryjs: user-mode x64 export
      // addresses are < 2^48, well within Number.MAX_SAFE_INTEGER (2^53);
      // formatPtr keeps the bigint for display.
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
