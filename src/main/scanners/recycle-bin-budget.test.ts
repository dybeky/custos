import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '', isPackaged: false, getVersion: () => '3.2.1', getAppPath: () => process.cwd() } }))

const root = mkdtempSync(join(tmpdir(), 'custos-rb-'))
vi.mock('../utils/drive-utils', () => ({ getAvailableDrives: async () => [root] }))

import { RecycleBinScanner } from './recycle-bin-scanner'

const FT = (ms: number) => (BigInt(ms) + 11_644_473_600_000n) * 10_000n
function info(path: string): Buffer {
  const p = Buffer.from(path + '\0', 'utf16le')
  const b = Buffer.alloc(28 + p.length)
  b.writeBigUInt64LE(2n, 0); b.writeBigUInt64LE(10n, 8); b.writeBigUInt64LE(FT(Date.parse('2026-09-27T12:30:00Z')), 16)
  b.writeUInt32LE(path.length + 1, 24); p.copy(b, 28)
  return b
}

const make = () => new RecycleBinScanner({ containsKeyword: (s: string) => /cheat/i.test(s) } as never, { excludedDirectories: [] } as never)

describe('RecycleBinScanner', () => {
  const sid = join(root, '$Recycle.Bin', 'S-1-5-21-1')
  mkdirSync(sid, { recursive: true })
  for (let i = 0; i < 200; i++) writeFileSync(join(sid, `$IA${i}`), info(`C:\\Users\\x\\Downloads\\file${i}.txt`))
  writeFileSync(join(sid, '$IZZZ'), info('C:\\Users\\x\\Downloads\\mycheat.exe'))

  it('finds a deleted cheat among many entries, all read in one pass', async () => {
    const res = await make().scan()
    expect(res.success).toBe(true)
    expect(res.findings).toHaveLength(1)
    expect(res.findings[0]).toMatch(/mycheat\.exe/)
    expect(res.partial).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  it('stops at its time budget and hands in what it has, marked partial, instead of running on', async () => {
    const scanner = make()
    scanner.setTimeBudget(0) // already out of time
    const res = await scanner.scan()
    expect(res.success).toBe(true)
    expect(res.partial).toMatch(/only partly read/)
  })
})
