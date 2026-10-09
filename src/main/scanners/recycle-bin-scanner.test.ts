import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// The scanner reads `<drive>\$Recycle.Bin`; here the "drive" is a temp folder.
// The bin path is built exactly as the scanner builds it, so this works on
// Windows and on other hosts alike.
const root = mkdtempSync(join(tmpdir(), 'custos-bin-'))
const drive = join(root, 'd')
vi.mock('../utils/drive-utils', () => ({ getAvailableDrives: async () => [drive] }))

import { RecycleBinScanner } from './recycle-bin-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

const FT = (ms: number) => (BigInt(ms) + 11_644_473_600_000n) * 10_000n
function info(path: string): Buffer {
  const p = Buffer.from(path + '\0', 'utf16le')
  const b = Buffer.alloc(28 + p.length)
  b.writeBigUInt64LE(2n, 0); b.writeBigUInt64LE(10n, 8); b.writeBigUInt64LE(FT(Date.parse('2026-09-27T12:30:00Z')), 16)
  b.writeUInt32LE(path.length + 1, 24); p.copy(b, 28)
  return b
}

beforeAll(() => {
  const sid = join(`${drive}\\`, '$Recycle.Bin', 'S-1-5-21-1')
  mkdirSync(sid, { recursive: true })
  // A deleted file named like a cheat.
  writeFileSync(join(sid, '$IAAA111.exe'), info('C:\\Users\\p\\Downloads\\aimbot.exe'))
  writeFileSync(join(sid, '$RAAA111.exe'), 'x')
  // A deleted folder with a plain name that holds a cheat.
  writeFileSync(join(sid, '$IBBB222'), info('C:\\Users\\p\\Desktop\\stuff'))
  mkdirSync(join(sid, '$RBBB222', 'bin'), { recursive: true })
  writeFileSync(join(sid, '$RBBB222', 'bin', 'aimbot.dll'), 'x')
  writeFileSync(join(sid, '$RBBB222', 'readme.txt'), 'x')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('RecycleBinScanner', () => {
  it('finds cheats by original name and inside deleted folders', async () => {
    const settings = { excludedDirectories: [], executableExtensions: [] } as never
    const scanner = new RecycleBinScanner(new KeywordMatcher({ patterns: ['aimbot'], exactMatch: [] }), settings)
    const { findings } = await scanner.scan()
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatch(/^\[Recycle Bin\] C:\\Users\\p\\Downloads\\aimbot\.exe \| deleted .* \| still restorable$/)
    expect(findings.some((f) => f.startsWith('[Recycle Bin] C:\\Users\\p\\Desktop\\stuff\\bin') && f.includes('aimbot.dll'))).toBe(true)
  })
})
