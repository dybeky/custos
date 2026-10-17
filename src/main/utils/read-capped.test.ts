import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readCapped, readTextCapped } from './read-capped'

describe('readCapped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'custos-cap-'))
  const file = join(dir, 'a.txt')
  writeFileSync(file, '0123456789')

  it('reads a small file whole', async () => {
    expect((await readCapped(file, 100)).toString()).toBe('0123456789')
  })

  it('keeps the head or the tail of a file over the cap', async () => {
    expect(await readTextCapped(file, 4)).toBe('0123')
    expect(await readTextCapped(file, 4, 'tail')).toBe('6789')
  })

  it('rejects a missing file like readFile does', async () => {
    await expect(readCapped(join(dir, 'nope'), 10)).rejects.toThrow()
  })

  it('cleans up', () => {
    rmSync(dir, { recursive: true, force: true })
  })
})
