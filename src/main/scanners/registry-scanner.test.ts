import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '', isPackaged: false, getVersion: () => '3.2.1', getAppPath: () => process.cwd() } }))

const calls: string[] = []
vi.mock('../utils/async-exec', () => ({
  execFileAsync: async (_file: string, args: string[]) => {
    calls.push(args[1])
    await new Promise((r) => setTimeout(r, 40)) // a slow process start
    return { stdout: '', stderr: '' }
  }
}))

import { RegistryScanner } from './registry-scanner'

const keys = Array.from({ length: 10 }, (_, i) => ({ path: `HKCU\\K${i}`, name: `Key${i}` }))
const make = () => new RegistryScanner({ containsKeyword: () => false } as never, { excludedDirectories: [] } as never, { scanKeys: keys } as never)

describe('RegistryScanner', () => {
  it('asks for the keys several at a time, so slow process starts do not add up', async () => {
    calls.length = 0
    const t0 = Date.now()
    const res = await make().scan()
    expect(res.success).toBe(true)
    expect(calls).toHaveLength(10)
    expect(Date.now() - t0).toBeLessThan(10 * 40 * 0.7) // serial would take 400 ms
    expect(res.partial).toBeUndefined()
  })

  it('reads no more keys once its time budget is spent, and says it is partial', async () => {
    calls.length = 0
    const scanner = make()
    scanner.setTimeBudget(0)
    const res = await scanner.scan()
    expect(res.success).toBe(true)
    expect(calls).toHaveLength(0)
    expect(res.partial).toMatch(/not read/)
  })
})
