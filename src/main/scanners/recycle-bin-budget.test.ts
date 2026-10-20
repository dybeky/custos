import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '', isPackaged: false, getVersion: () => '3.2.1', getAppPath: () => process.cwd() } }))
vi.mock('../utils/drive-utils', () => ({ getAvailableDrives: async () => ['C:', 'D:'] }))

import { RecycleBinScanner } from './recycle-bin-scanner'

describe('RecycleBinScanner time budget', () => {
  it('stops at its time budget and hands in what it has, marked partial, instead of running on', async () => {
    const scanner = new RecycleBinScanner({} as never, { excludedDirectories: [] } as never)
    scanner.setTimeBudget(0) // already out of time
    const res = await scanner.scan()
    expect(res.success).toBe(true)
    expect(res.partial).toMatch(/only partly read/)
  })
})
