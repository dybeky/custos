import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

// A fake home and temp folder for the scan targets.
const dirs = vi.hoisted(() => ({ base: '', home: '', temp: '' }))
vi.mock('os', async (orig) => {
  const os = await orig<typeof import('os')>()
  return { ...os, homedir: () => dirs.home, tmpdir: () => dirs.temp }
})
const hashes: { list: string[] } = vi.hoisted(() => ({ list: [] }))
vi.mock('../services/config-service', () => ({ configService: { loadKnownHashes: () => hashes.list } }))

import { FileHashScanner, hashFile } from './file-hash-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

const settings = { excludedDirectories: [] } as never
const matcher = new KeywordMatcher({ patterns: ['aimbot'], exactMatch: [] })

const { tmpdir: realTmp } = await vi.importActual<typeof import('os')>('os')
dirs.base = mkdtempSync(join(realTmp(), 'custos-fh-'))
dirs.home = join(dirs.base, 'home')
dirs.temp = join(dirs.base, 'temp')
const { home, temp } = dirs

beforeAll(() => {
  mkdirSync(join(home, 'Downloads'), { recursive: true })
  writeFileSync(join(home, 'Downloads', 'aimbot.exe'), 'cheat')
  writeFileSync(join(home, 'Downloads', 'renamed.bin'), 'known cheat bytes')
  // Custos's own session folder in %TEMP% is never scanned.
  mkdirSync(join(temp, 'custos-session-0123456789abcdef'), { recursive: true })
  writeFileSync(join(temp, 'custos-session-0123456789abcdef', 'aimbot-log.txt'), 'x')
})
afterAll(() => rmSync(dirs.base, { recursive: true, force: true }))

describe('FileHashScanner', () => {
  it('reports name matches (with their hash) and skips its own temp folders', async () => {
    hashes.list = []
    const { findings } = await new FileHashScanner(matcher, settings).scan()
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('aimbot.exe')
    expect(findings[0]).toContain((await hashFile(join(home, 'Downloads', 'aimbot.exe'))).slice(0, 16))
  })

  it('still finds a renamed file by a known hash', async () => {
    hashes.list = [await hashFile(join(home, 'Downloads', 'renamed.bin'))]
    const { findings } = await new FileHashScanner(matcher, settings).scan()
    expect(findings.some((f) => f.includes('renamed.bin'))).toBe(true)
  })
})
