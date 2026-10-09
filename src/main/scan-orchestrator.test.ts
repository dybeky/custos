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
