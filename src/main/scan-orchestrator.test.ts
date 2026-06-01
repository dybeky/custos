import { describe, it, expect } from 'vitest'
import { SCANNER_GROUPS, getGroupForScanner } from './scan-orchestrator'
import type { ScannerName } from './scanners'

const ALL: ScannerName[] = ['appdata','prefetch','recentfiles','gamefolder','registry','browserhistory','process','steam','amcache','bam','shellbags','vm','dnscache','scheduledtasks','filehash','windowmodule']

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
