import { readBuffer } from '../native/memory'
import { resolveExportAddresses } from '../native/winapi'
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

export const hookDetector = {
  id: 'hook',
  name: 'IAT / Inline Hook Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    // Read the first bytes at each hook-prone export's entry point in the target
    // process and flag trampoline prologues. System DLLs share a base within a
    // session, so the address resolved in our process is valid in the target.
    for (const exp of resolveExportAddresses()) {
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
