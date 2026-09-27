import { describe, it, expect } from 'vitest'
import { filetimeToMs, parseRecycleInfo } from './recycle-bin'

const FT = (ms: number) => (BigInt(ms) + 11_644_473_600_000n) * 10_000n
const WHEN = Date.parse('2026-09-27T12:30:00Z')

function v2(path: string, ms = WHEN, size = 4096n): Buffer {
  const p = Buffer.from(path + '\0', 'utf16le')
  const b = Buffer.alloc(28 + p.length)
  b.writeBigUInt64LE(2n, 0); b.writeBigUInt64LE(size, 8); b.writeBigUInt64LE(FT(ms), 16)
  b.writeUInt32LE(path.length + 1, 24); p.copy(b, 28)
  return b
}

function v1(path: string, ms = WHEN): Buffer {
  const b = Buffer.alloc(24 + 520)
  b.writeBigUInt64LE(1n, 0); b.writeBigUInt64LE(10n, 8); b.writeBigUInt64LE(FT(ms), 16)
  Buffer.from(path, 'utf16le').copy(b, 24)
  return b
}

describe('Recycle Bin $I parser', () => {
  it('converts FILETIME', () => {
    expect(filetimeToMs(FT(WHEN))).toBe(WHEN)
  })

  it('parses Windows 10+ (v2) records', () => {
    expect(parseRecycleInfo(v2('C:\\Users\\p\\Downloads\\Fecurity64.exe'))).toEqual({
      originalPath: 'C:\\Users\\p\\Downloads\\Fecurity64.exe', sizeBytes: 4096, deletedAt: WHEN
    })
  })

  it('parses Vista–8.1 (v1) records', () => {
    expect(parseRecycleInfo(v1('D:\\cheats\\undead.dll'))?.originalPath).toBe('D:\\cheats\\undead.dll')
  })

  it('rejects truncated, unknown-version and implausible records', () => {
    expect(parseRecycleInfo(Buffer.alloc(10))).toBeNull()
    const bad = v2('C:\\x.exe'); bad.writeBigUInt64LE(7n, 0)
    expect(parseRecycleInfo(bad)).toBeNull()
    const trunc = v2('C:\\x.exe').subarray(0, 30)
    expect(parseRecycleInfo(trunc)).toBeNull()
    expect(parseRecycleInfo(v2('not-a-path'))).toBeNull()
    expect(parseRecycleInfo(v2('C:\\x.exe', 0))).toBeNull()
  })
})
