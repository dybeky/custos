import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '', isPackaged: false, getVersion: () => '3.2.1', getAppPath: () => process.cwd() } }))

const regCalls: Array<{ args: string[]; timeoutMs?: number }> = []
vi.mock('../utils/async-exec', () => ({
  execFileAsync: async (_f: string, args: string[], opts?: { timeoutMs?: number }) => {
    regCalls.push({ args, timeoutMs: opts?.timeoutMs })
    return { stdout: '', stderr: '' }
  }
}))

import { BaseScanner, type ScannerEventEmitter } from './base-scanner'
import { RegistryQueryScanner } from './registry-query-scanner'
import type { ScanResult } from '../../shared/types'

const settings = { excludedDirectories: [] } as never
const matcher = { containsKeywordWithWhitelist: (n: string) => /cheat/i.test(n), containsKeyword: () => false } as never

class Walker extends BaseScanner {
  readonly name = 'Walker'
  readonly description = 'test'
  constructor(private root: string) { super(matcher, settings) }
  protected async doScan(_e: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    return this.createSuccessResult(await this.scanFolder(this.root, [], 3), startTime)
  }
}

class Reg extends RegistryQueryScanner {
  readonly name = 'Reg'
  readonly description = 'test'
  constructor() { super(matcher, settings) }
  protected async doScan(_e: ScannerEventEmitter | undefined, startTime: Date): Promise<ScanResult> {
    await this.runRegQuery('HKCU\\Software\\X')
    return this.createSuccessResult([], startTime)
  }
}

describe('time budget in the shared scanner base', () => {
  const root = mkdtempSync(join(tmpdir(), 'custos-walk-'))
  mkdirSync(join(root, 'a'), { recursive: true })
  writeFileSync(join(root, 'cheat.txt'), 'x')
  writeFileSync(join(root, 'a', 'cheat2.txt'), 'x')

  it('walks the whole tree when there is time, with no partial note', async () => {
    const res = await new Walker(root).scan()
    expect(res.findings).toHaveLength(2)
    expect(res.partial).toBeUndefined()
  })

  it('stops a folder walk at the budget and marks the result partial', async () => {
    const s = new Walker(root)
    s.setTimeBudget(0)
    const res = await s.scan()
    expect(res.success).toBe(true)
    expect(res.partial).toMatch(/time limit/)
    rmSync(root, { recursive: true, force: true })
  })

  it('skips a registry query when out of time, and cuts one that is running at the budget', async () => {
    regCalls.length = 0
    const none = new Reg()
    none.setTimeBudget(0)
    const res = await none.scan()
    expect(regCalls).toHaveLength(0)
    expect(res.partial).toMatch(/time limit/)

    const some = new Reg()
    some.setTimeBudget(5000)
    await some.scan()
    expect(regCalls).toHaveLength(1)
    expect(regCalls[0].timeoutMs).toBeGreaterThan(1000)
    expect(regCalls[0].timeoutMs).toBeLessThanOrEqual(5000)

    const free = new Reg() // no budget set: the old 15 s default of execFileAsync
    await free.scan()
    expect(regCalls[1].timeoutMs).toBeUndefined()
  })
})
