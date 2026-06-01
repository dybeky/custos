import { listModules } from '../native/memory'
import { listThreadStartAddresses } from '../native/winapi'
import type { LiveContext, LiveFinding } from '../../../shared/types'

export interface ModuleRange { name: string; base: number; size: number }

/** True when `addr` falls within [base, base+size) of any module. End-exclusive. */
export function isAddressInAnyModule(addr: number, modules: ModuleRange[]): boolean {
  return modules.some((m) => addr >= m.base && addr < m.base + m.size)
}

export const threadDetector = {
  id: 'thread-start',
  name: 'Thread Start-Address Check',

  async run(ctx: LiveContext): Promise<LiveFinding[]> {
    const ranges: ModuleRange[] = listModules(ctx.pid).map((m) => ({
      name: m.szModule ?? '',
      base: Number(m.modBaseAddr),
      size: Number(m.modBaseSize)
    }))
    if (ranges.length === 0) return []

    const findings: LiveFinding[] = []
    for (const addr of listThreadStartAddresses(ctx.pid)) {
      if (addr !== 0 && !isAddressInAnyModule(addr, ranges)) {
        findings.push({
          detectorId: 'thread-start',
          detectorName: 'Thread Start-Address Check',
          title: 'Thread starting outside any module',
          detail: `A thread starts at 0x${addr.toString(16).toUpperCase()}, which is not inside any loaded module — possible injected/manual-mapped code.`,
          confidence: 'suspicious'
        })
      }
    }
    return findings
  }
}
