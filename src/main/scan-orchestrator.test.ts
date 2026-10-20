import { describe, it, expect } from 'vitest'
import { SCANNER_GROUPS, getGroupForScanner } from './scan-orchestrator'
import type { ScannerName } from './scanners'

const ALL: ScannerName[] = ['appdata','prefetch','recentfiles','gamefolder','registry','browserhistory','process','steam','amcache','bam','shellbags','vm','dnscache','scheduledtasks','filehash','windowmodule','antiforensics','defender','recyclebin','usb','usnjournal']

describe('scanner grouping', () => {
  it('assigns every scanner to exactly one group', () => {
    for (const id of ALL) {
      const groups = SCANNER_GROUPS.filter(g => g.members.includes(id))
      expect(groups.length, `scanner ${id}`).toBe(1)
    }
  })
  it('getGroupForScanner returns a group for every scanner', () => {
    for (const id of ALL) expect(getGroupForScanner(id)).toBeDefined()
  })
})

describe('runScan after a cancel', () => {
  it('stops reporting results once the scan is aborted', async () => {
    const { runScan } = await import('./scan-orchestrator')
    const controller = new AbortController()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const scanner = {
      name: 'Prefetch Scanner',
      setTimeBudget: () => {},
      scan: async () => {
        await gate
        return { scannerName: 'Prefetch Scanner', success: true, findings: ['x'], startTime: new Date(), endTime: new Date(), duration: 1, count: 1, hasFindings: true }
      }
    }
    const factory = { getScanner: (id: string) => (id === 'prefetch' ? scanner : undefined) }
    const channels: string[] = []
    const done = runScan({
      factory: factory as never,
      requestedIds: ['prefetch'],
      supportedIds: new Set(['prefetch']) as never,
      emit: (channel) => channels.push(channel),
      signal: controller.signal,
      timeoutMs: 5000
    })
    await Promise.resolve()
    const beforeCancel = channels.length
    controller.abort()
    release()
    await done
    // Only the "starting" progress from before the cancel; no late result.
    expect(channels.length).toBe(beforeCancel)
    expect(channels).not.toContain('scan:result')
  })
})

describe('runScan time budget', () => {
  it('gives each scanner a budget that ends before its timeout', async () => {
    const { runScan } = await import('./scan-orchestrator')
    let budget = -1
    const scanner = {
      name: 'Prefetch Scanner',
      setTimeBudget: (ms: number) => { budget = ms },
      scan: async () => ({ scannerName: 'Prefetch Scanner', success: true, findings: [], startTime: new Date(), endTime: new Date(), duration: 1, count: 0, hasFindings: false })
    }
    const results = await runScan({
      factory: { getScanner: () => scanner } as never,
      requestedIds: ['prefetch'],
      supportedIds: new Set(['prefetch']) as never,
      emit: () => {},
      signal: new AbortController().signal,
      timeoutMs: 30000
    })
    expect(results).toHaveLength(1)
    expect(budget).toBe(22500)
  })
})

describe('runScan timeout detail', () => {
  const run = async (scan: (events?: { onProgress: (p: never) => void }) => Promise<unknown>) => {
    const { runScan } = await import('./scan-orchestrator')
    const scanner = { name: 'Recycle Bin Scanner', setTimeBudget: () => {}, cancel: () => {}, scan }
    return runScan({
      factory: { getScanner: () => scanner } as never,
      requestedIds: ['recyclebin'],
      supportedIds: new Set(['recyclebin']) as never,
      emit: () => {},
      signal: new AbortController().signal,
      timeoutMs: 50
    })
  }

  it('says at which step a scanner that ran out of time stopped', async () => {
    const [r] = await run(async (events) => {
      events?.onProgress({ currentItem: 2, totalItems: 4, scannerName: 'x', currentPath: 'C://secret/path', percentage: 50 } as never)
      return new Promise(() => {}) // never finishes
    })
    expect(r.error).toBe('Scanner timeout (0.05s)')
    expect(r.detail).toBe('step 2/4')
    expect(JSON.stringify(r.detail)).not.toContain('secret')
  })

  it('says so when it reported no progress at all', async () => {
    const [r] = await run(() => new Promise(() => {}))
    expect(r.detail).toBe('before its first step')
  })
})
