import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashFile } from './file-hash-scanner'

describe('hashFile', () => {
  it('produces the correct SHA-256 for a known string', async () => {
    // printf 'custos' | shasum -a 256 → precomputed value
    const expected = '3f125a3e36bc5ae9fb56810465e243935a586f219361013a463aa97a09e9a8cf'

    const dir = mkdtempSync(join(tmpdir(), 'custos-hash-test-'))
    const filePath = join(dir, 'test.txt')
    try {
      writeFileSync(filePath, 'custos')
      const hash = await hashFile(filePath)
      expect(hash).toBe(expected)
    } finally {
      try { unlinkSync(filePath) } catch { /* ignore */ }
      try { rmdirSync(dir) } catch { /* ignore */ }
    }
  })

  it('produces different hashes for different content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'custos-hash-test-'))
    const fileA = join(dir, 'a.txt')
    const fileB = join(dir, 'b.txt')
    try {
      writeFileSync(fileA, 'hello')
      writeFileSync(fileB, 'world')
      const [hashA, hashB] = await Promise.all([hashFile(fileA), hashFile(fileB)])
      expect(hashA).not.toBe(hashB)
      expect(hashA).toHaveLength(64)
      expect(hashB).toHaveLength(64)
    } finally {
      try { unlinkSync(fileA) } catch { /* ignore */ }
      try { unlinkSync(fileB) } catch { /* ignore */ }
      try { rmdirSync(dir) } catch { /* ignore */ }
    }
  })

  it('produces the same hash when called twice on the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'custos-hash-test-'))
    const filePath = join(dir, 'stable.txt')
    try {
      writeFileSync(filePath, 'deterministic content')
      const [h1, h2] = await Promise.all([hashFile(filePath), hashFile(filePath)])
      expect(h1).toBe(h2)
    } finally {
      try { unlinkSync(filePath) } catch { /* ignore */ }
      try { rmdirSync(dir) } catch { /* ignore */ }
    }
  })
})
