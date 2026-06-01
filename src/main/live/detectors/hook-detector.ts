import { listModules, readBuffer } from '../native/memory'
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
  if (bytes[0] === 0xff && bytes[1] === 0x25) return true
  if (bytes[0] === 0x68 && bytes.length >= 6 && bytes[5] === 0xc3) return true
  return false
}

export const hookDetector = {
  id: 'hook',
  name: 'IAT / Inline Hook Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    // Inline-hook check: read the first bytes at each game module's base entry
    // region and flag trampoline prologues. (Deep per-export + IAT-table walking
    // is a documented Phase-B stub; this catches base-level inline patches.)
    for (const mod of listModules(ctx.pid)) {
      const base = Number(mod.modBaseAddr)
      if (!base) continue
      const bytes = readBuffer(ctx.handle, base, 8)
      if (bytes && isHookedPrologue(bytes)) {
        findings.push({
          detectorId: 'hook',
          detectorName: 'IAT / Inline Hook Check',
          title: 'Possible inline hook',
          detail: `Trampoline-like prologue at the base of ${mod.szModule} (0x${base.toString(16).toUpperCase()}).`,
          confidence: 'suspicious'
        })
      }
    }

    // Phase-B stub: walk the game PE's import table and compare each thunk to the
    // exporting module's address range to catch IAT redirections. Left for a
    // follow-up once the inline check is proven on Windows.

    return findings
  }
}
