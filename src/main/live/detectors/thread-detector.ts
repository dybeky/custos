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
          confidence: 'suspicious',
          i18nKey: 'threadOutsideModule',
          params: { address: formatPtr(addr) }
        })
      }
    }
    return findings
  }
}
