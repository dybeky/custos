import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateUpdate, pickAsset, downloadVerified, swapScript } from './updater'
import type { GithubAsset, GithubRelease } from './github-service'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const rel = (tag: string): GithubRelease => ({
  tagName: tag, body: 'feat: shiny\nfix: bug', htmlUrl: 'https://x/r/' + tag, publishedAt: '2026-06-01T00:00:00Z'
})

describe('evaluateUpdate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports an update when the release tag is newer', () => {
    const info = evaluateUpdate('3.0.0', { status: 'ok', release: rel('v3.1.0') })
    expect(info.updateAvailable).toBe(true)
    expect(info.latestVersion).toBe('v3.1.0')
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v3.1.0')
    expect(info.notes.length).toBeGreaterThan(0)
  })

  it('reports no update when current is up to date', () => {
    const info = evaluateUpdate('3.1.0', { status: 'ok', release: rel('v3.1.0') })
    expect(info.updateAvailable).toBe(false)
  })

  it('reports no update when there is no release', () => {
    const info = evaluateUpdate('3.0.0', { status: 'ok', release: null })
    expect(info.updateAvailable).toBe(false)
    expect(info.latestVersion).toBeNull()
  })
})

describe('evaluateUpdate tri-state', () => {
  it('marks checkFailed when the release fetch errored', () => {
    const info = evaluateUpdate('1.0.0', { status: 'error', release: null })
    expect(info.checkFailed).toBe(true)
    expect(info.updateAvailable).toBe(false)
  })
  it('reports up-to-date distinctly from a failed check', () => {
    const info = evaluateUpdate('2.0.0', { status: 'ok', release: { tagName: 'v2.0.0', body: '', htmlUrl: '', publishedAt: '' } })
    expect(info.checkFailed).toBe(false)
    expect(info.updateAvailable).toBe(false)
  })
})

describe('evaluateUpdate URL', () => {
  const evilRel = (tag: string): GithubRelease => ({
    tagName: tag, body: '- New thing', htmlUrl: 'https://evil.example/pwn', publishedAt: '2026-01-01T00:00:00Z'
  })

  it('builds the download URL from REPO, ignoring the API html_url', () => {
    const info = evaluateUpdate('1.0.0', { status: 'ok', release: evilRel('v2.0.0') })
    expect(info.updateAvailable).toBe(true)
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v2.0.0')
    expect(info.url).not.toContain('evil.example')
  })
})

const DL = 'https://github.com/dybeky/custos/releases/download/3.1.0/'
const asset = (name: string, over: Partial<GithubAsset> = {}): GithubAsset => ({
  name, url: DL + name, size: 100, sha256: 'a'.repeat(64), ...over
})

describe('pickAsset', () => {
  it('prefers the exe built for this architecture', () => {
    const list = [asset('custos.exe'), asset('custos-arm64.exe'), asset('custos-x64.exe')]
    expect(pickAsset(list, 'x64')?.name).toBe('custos-x64.exe')
    expect(pickAsset(list, 'arm64')?.name).toBe('custos-arm64.exe')
  })

  it('falls back to the pre-3.0 custos.exe on x64 only', () => {
    expect(pickAsset([asset('custos.exe')], 'x64')?.name).toBe('custos.exe')
    expect(pickAsset([asset('custos.exe')], 'arm64')).toBeNull()
  })

  it('refuses assets it could not verify or that live elsewhere', () => {
    expect(pickAsset([asset('custos-x64.exe', { sha256: null })], 'x64')).toBeNull()
    expect(pickAsset([asset('custos-x64.exe', { url: 'https://evil.example/custos-x64.exe' })], 'x64')).toBeNull()
    expect(pickAsset([asset('custos-x64.exe', { url: 'http://github.com/dybeky/custos/releases/download/3.1.0/custos-x64.exe' })], 'x64')).toBeNull()
    expect(pickAsset([asset('custos-x64.exe', { url: 'https://github.com/someone/else/releases/download/1/custos-x64.exe' })], 'x64')).toBeNull()
    expect(pickAsset([asset('custos-x64.exe', { size: 0 })], 'x64')).toBeNull()
    expect(pickAsset(undefined, 'x64')).toBeNull()
  })

  it('evaluateUpdate offers an install only when a verifiable asset exists', () => {
    const release = (assets: GithubAsset[]): GithubRelease => ({ ...rel('3.1.0'), assets })
    expect(evaluateUpdate('3.0.0', { status: 'ok', release: release([asset('custos-x64.exe')]) }, 'x64').canInstall).toBe(true)
    expect(evaluateUpdate('3.0.0', { status: 'ok', release: release([]) }, 'x64').canInstall).toBe(false)
    // Up to date: nothing to install even if the asset is there.
    expect(evaluateUpdate('3.1.0', { status: 'ok', release: release([asset('custos-x64.exe')]) }, 'x64').canInstall).toBe(false)
  })
})

describe('downloadVerified', () => {
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(98, 7)])
  const sha = createHash('sha256').update(exe).digest('hex')
  const serve = (body: Buffer, status = 200) =>
    (async () => new Response(status === 200 ? new Uint8Array(body) : null, { status })) as unknown as typeof fetch

  const withTmp = async (fn: (file: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), 'custos-upd-test-'))
    try { await fn(join(dir, 'u.exe')) } finally { rmSync(dir, { recursive: true, force: true }) }
  }

  it('writes a download whose size, header and SHA-256 match', async () => {
    await withTmp(async (file) => {
      const seen: number[] = []
      await downloadVerified(asset('custos-x64.exe', { size: exe.length, sha256: sha }), file, (p) => seen.push(p.received), serve(exe))
      expect(readFileSync(file).equals(exe)).toBe(true)
      expect(seen.at(-1)).toBe(exe.length)
    })
  })

  it('rejects a tampered, truncated, oversized or non-exe download', async () => {
    await withTmp(async (file) => {
      const a = asset('custos-x64.exe', { size: exe.length, sha256: sha })
      const tampered = Buffer.from(exe); tampered[50] ^= 1
      await expect(downloadVerified(a, file, () => {}, serve(tampered))).rejects.toThrow(/SHA-256/)
      await expect(downloadVerified(a, file, () => {}, serve(exe.subarray(0, 60)))).rejects.toThrow(/incomplete/)
      await expect(downloadVerified(a, file, () => {}, serve(Buffer.concat([exe, exe])))).rejects.toThrow(/larger/)
      const notExe = Buffer.from(exe); notExe[0] = 0x50
      const b = asset('custos-x64.exe', { size: notExe.length, sha256: createHash('sha256').update(notExe).digest('hex') })
      await expect(downloadVerified(b, file, () => {}, serve(notExe))).rejects.toThrow(/Windows program/)
      await expect(downloadVerified(a, file, () => {}, serve(exe, 404))).rejects.toThrow(/HTTP 404/)
    })
  })
})

describe('swapScript', () => {
  it('deletes the download only after the whole retry loop, never inside it', () => {
    const s = swapScript('C:\\T\\custos-update-0123456789abcdef.exe', 'D:\\My Tools\\custos-x64.exe')
    expect(s.startsWith('(for /l %i in (1,1,40) do (')).toBe(true)
    const del = s.indexOf('del /f /q')
    expect(s.lastIndexOf('))', del)).toBeGreaterThan(s.indexOf('move /y'))
    expect(s).toContain('"D:\\My Tools\\custos-x64.exe"')
  })
})
