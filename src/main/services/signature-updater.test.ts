import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateKeyPairSync, sign } from 'crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SignatureUpdater } from './signature-updater'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const PUB = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

function bundle(version: number, patterns = ['megacheat']) {
  const text = JSON.stringify({ format: 1, version, issuedAt: 'x', patterns, exactMatch: [], domains: [], hashes: [] })
  return { payload: text, signature: sign(null, Buffer.from(text), privateKey).toString('base64') }
}

const reply = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'custos-sig-')) })

function make(fetchImpl: (url: string) => unknown, publicKey = PUB) {
  const applied: number[] = []
  const urls: string[] = []
  const updater = new SignatureUpdater({
    baseUrl: 'https://97437.dev',
    publicKey,
    cacheFile: join(dir, 'site-signatures.json'),
    appVersion: '3.0.0',
    onApply: (b) => applied.push(b.version),
    fetchImpl: vi.fn(async (u: string) => { urls.push(String(u)); return fetchImpl(String(u)) }) as unknown as typeof fetch
  })
  return { updater, applied, urls }
}

describe('SignatureUpdater', () => {
  it('is off without a pinned key and never calls the site', async () => {
    const { updater, urls } = make(() => reply(200, bundle(1)), '')
    expect((await updater.check()).enabled).toBe(false)
    expect(urls).toEqual([])
  })

  it('applies and caches a verified bundle, then asks only for newer ones', async () => {
    let next: unknown = reply(200, { version: 3, ...bundle(3) })
    const { updater, applied, urls } = make(() => next)
    const s = await updater.check()
    expect(s).toMatchObject({ enabled: true, version: 3, entries: 1 })
    expect(applied).toEqual([3])
    expect(JSON.parse(readFileSync(join(dir, 'site-signatures.json'), 'utf8')).payload).toContain('megacheat')

    next = reply(204)
    await updater.check()
    expect(urls[1]).toBe('https://97437.dev/api/desktop/signatures?since=3')
    expect(applied).toEqual([3])
  })

  it('refuses an older bundle (rollback) and a bad signature', async () => {
    let next: unknown = reply(200, bundle(5))
    const { updater, applied } = make(() => next)
    await updater.check()
    next = reply(200, bundle(4, []))
    await updater.check()
    expect(applied).toEqual([5])
    const forged = bundle(9)
    next = reply(200, { ...forged, payload: forged.payload.replace('megacheat', 'explorer') })
    expect((await updater.check()).lastError).toBe('bad_signature')
    expect(applied).toEqual([5])
  })

  it('re-verifies the cache on load, so a hand-edited cache is ignored', async () => {
    const good = bundle(2)
    writeFileSync(join(dir, 'site-signatures.json'), JSON.stringify(good))
    const first = make(() => reply(204))
    await first.updater.loadCached()
    expect(first.applied).toEqual([2])

    writeFileSync(join(dir, 'site-signatures.json'), JSON.stringify({ ...good, payload: good.payload.replace('"version":2', '"version":99') }))
    const second = make(() => reply(204))
    await second.updater.loadCached()
    expect(second.applied).toEqual([])
  })

  it('treats "signing disabled" as nothing published, other failures as errors', async () => {
    let next: unknown = reply(503, { error: 'signing_disabled' })
    const { updater } = make(() => next)
    expect((await updater.check()).lastError).toBeUndefined()
    next = Promise.reject(new TypeError('fetch failed'))
    expect((await updater.check()).lastError).toBe('network')
  })
})
