import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BaseScanner, ScannerEventEmitter } from './base-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'
import type { ScanResult } from '../../shared/types'
import type { ScanSettings } from '../services/config-service'

// Concrete scanner that exposes the protected recursive walker for testing.
class TestScanner extends BaseScanner {
  readonly name = 'Test Scanner'
  readonly description = 'test'
  protected async doScan(_e: ScannerEventEmitter | undefined, start: Date): Promise<ScanResult> {
    return this.createSuccessResult([], start)
  }
  async walk(path: string, depth: number): Promise<string[]> {
    return this.scanFolder(path, [], depth)
  }
}

function makeScanner(): TestScanner {
  const matcher = new KeywordMatcher({ patterns: ['cheat'], exactMatch: [] })
  const settings = { excludedDirectories: [] } as unknown as ScanSettings
  return new TestScanner(matcher, settings)
}

// Directory symlinks need admin rights or Developer Mode on Windows; where the
// OS refuses them the symlink cases are skipped (the junction cases below
// cover the same invariant without elevation).
const canSymlink = ((): boolean => {
  const probe = mkdtempSync(join(tmpdir(), 'custos-probe-'))
  try {
    symlinkSync(probe, join(probe, 'link'), 'dir')
    return true
  } catch {
    return false
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
})()

let root: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'custos-scan-'))
  outside = mkdtempSync(join(tmpdir(), 'custos-out-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('BaseScanner.scanFolder traversal', () => {
  it('finds keyword-matching dirs and files across nested levels', async () => {
    mkdirSync(join(root, 'cheat-tool', 'inner', 'deep-cheat'), { recursive: true })
    mkdirSync(join(root, 'benign'))
    writeFileSync(join(root, 'benign', 'cheat.log'), 'x')
    writeFileSync(join(root, 'cheat.dll'), 'x')
    writeFileSync(join(root, 'readme.txt'), 'x')

    const found = await makeScanner().walk(root, 5)

    expect(found).toContain(join(root, 'cheat-tool'))
    expect(found).toContain(join(root, 'cheat-tool', 'inner', 'deep-cheat'))
    expect(found).toContain(join(root, 'benign', 'cheat.log'))
    expect(found).toContain(join(root, 'cheat.dll'))
    expect(found).not.toContain(join(root, 'readme.txt'))
    expect(found).not.toContain(join(root, 'benign'))
  })

  it.skipIf(!canSymlink)('does not follow a directory link that escapes the scan root', async () => {
    mkdirSync(join(outside, 'cheat-secret'))
    writeFileSync(join(outside, 'cheat-secret', 'cheat.dll'), 'x')
    symlinkSync(outside, join(root, 'link'), 'dir')

    const found = await makeScanner().walk(root, 5)

    expect(found.some((p) => p.includes('cheat-secret'))).toBe(false)
  })

  it('returns no results for a missing root', async () => {
    expect(await makeScanner().walk(join(root, 'does-not-exist'), 5)).toEqual([])
  })

  it('respects the depth limit', async () => {
    mkdirSync(join(root, 'a', 'b', 'cheat-deep'), { recursive: true })
    writeFileSync(join(root, 'a', 'cheat-shallow.dll'), 'x')

    const found = await makeScanner().walk(root, 1)

    expect(found).toContain(join(root, 'a', 'cheat-shallow.dll'))
    expect(found).not.toContain(join(root, 'a', 'b', 'cheat-deep'))
  })

  it('stops walking once cancelled', async () => {
    mkdirSync(join(root, 'cheat-tool'))
    const scanner = makeScanner()
    scanner.cancel()

    expect(await scanner.walk(root, 5)).toEqual([])
  })

  it('does not block the event loop while walking', async () => {
    for (let i = 0; i < 20; i++) mkdirSync(join(root, `dir-${i}`, 'cheat-x'), { recursive: true })
    let ticked = false
    setImmediate(() => { ticked = true })

    await makeScanner().walk(root, 5)

    // A synchronous walk would finish before the immediate ever ran.
    expect(ticked).toBe(true)
  })

  it.skipIf(!canSymlink)('terminates (does not hang) on a self-referential directory loop', async () => {
    mkdirSync(join(root, 'cheat-tool'))
    symlinkSync(root, join(root, 'cheat-tool', 'loop'), 'dir')

    const found = await makeScanner().walk(root, 8)

    expect(found).toContain(join(root, 'cheat-tool'))
  })
})

// Windows directory junctions are reparse points. On current Node/libuv,
// readdir({ withFileTypes: true }) reports them as symbolic links, so the
// isSymbolicLink() skip in the folder walk already stops them — exactly like a
// symlink. The realpath + isWithin containment check is the second layer of
// defense, covering any reparse point a Node version might instead surface as a
// plain directory. Either way the invariant is the same: a junction pointing
// outside the scan root must never leak the target's contents. These create
// real junctions, so they only run on Windows; junction creation does not
// require elevation (unlike symlinks).
describe.runIf(process.platform === 'win32')('BaseScanner.scanFolder junctions', () => {
  it('does not descend through a junction that escapes the scan root', async () => {
    mkdirSync(join(outside, 'cheat-secret'))
    writeFileSync(join(outside, 'cheat-secret', 'cheat.dll'), 'x')
    symlinkSync(outside, join(root, 'cheat-link'), 'junction')

    const found = await makeScanner().walk(root, 5)

    // Whether the junction is skipped as a reparse point or stopped by the
    // realpath + isWithin check, its out-of-root target must never be reached.
    expect(found.some((p) => p.includes('cheat-secret'))).toBe(false)
  })

  it('terminates on a junction loop back to the scan root', async () => {
    mkdirSync(join(root, 'cheat-tool'))
    symlinkSync(root, join(root, 'cheat-tool', 'loop'), 'junction')

    const found = await makeScanner().walk(root, 8)

    // realpath('loop') === root, already in the visited set → skipped, no hang.
    expect(found).toContain(join(root, 'cheat-tool'))
  })
})
