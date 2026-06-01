import { scanPattern } from '../native/memory'
import { parseAobPattern } from '../signatures'
import type { LiveContext, LiveFinding } from '../../../shared/types'

/** True when a pattern string is a valid AOB (hex bytes + ?? wildcards). */
export function isScannablePattern(pattern: string): boolean {
  return parseAobPattern(pattern) !== null
}

/** Build a high-confidence finding for a matched signature. */
export function buildAobFinding(name: string, address: number): LiveFinding {
  return {
    detectorId: 'aob',
    detectorName: 'AOB Memory Signature Scan',
    title: 'Cheat signature found in memory',
    detail: `Signature "${name}" matched at 0x${address.toString(16).toUpperCase()}.`,
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
      // memoryjs returns address 0 when not found.
      if (result && typeof result === 'number' && result !== 0) {
        findings.push(buildAobFinding(sig.name, result))
      } else if (result && typeof result === 'object' && 'address' in result && (result as { address: number }).address) {
        findings.push(buildAobFinding(sig.name, (result as { address: number }).address))
      }
    }
    return findings
  }
}
