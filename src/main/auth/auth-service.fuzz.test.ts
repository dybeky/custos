import { describe, it, expect } from 'vitest'
import { AuthService } from './auth-service'
import { AuthClient } from './auth-client'
import { TokenStore } from './token-store'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function service(body: () => Response | Promise<Response>): AuthService {
  let rec: unknown = {}
  const store = { get: () => rec, set: (_k: string, v: unknown) => { rec = v }, delete: () => { rec = {} } }
  const tokens = new TokenStore({
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
    store: store as never
  })
  const config = { enabled: true, webBaseUrl: 'http://localhost:3100' }
  const client = new AuthClient(config.webBaseUrl, (async () => body()) as unknown as typeof fetch)
  return new AuthService({ client, tokens, config, openExternal: () => {}, onChange: () => {} })
}

function randomJson(r: () => number, depth = 0): unknown {
  const k = Math.floor(r() * (depth > 3 ? 6 : 9))
  switch (k) {
    case 0: return null
    case 1: return Math.floor(r() * 1000) - 500
    case 2: return r() < 0.5
    case 3: return ['', 'x', 'clean', 'high', '\u0000', 'Ж'.repeat(300)][Math.floor(r() * 6)]
    case 4: return NaN
    case 5: return undefined
    case 6: return Array.from({ length: Math.floor(r() * 4) }, () => randomJson(r, depth + 1))
    default: {
      const keys = ['uploader', 'anonymous', 'hashVerified', 'case', 'report', 'id', 'meta', 'verdict', 'findings', 'correlations', 'scanners', 'checks', 'page', 'pageSize', 'total', 'score', 'band', 'reasons', 'scannedAt', 'error']
      const o: Record<string, unknown> = {}
      for (let i = 0; i < Math.floor(r() * 8); i++) o[keys[Math.floor(r() * keys.length)]] = randomJson(r, depth + 1)
      return o
    }
  }
}

describe('reports opened from the site', () => {
  it('malformed JSON, wrong types and odd statuses come back as an error object, never a throw', async () => {
    const r = rng(21)
    for (let i = 0; i < 400; i++) {
      const status = [200, 200, 200, 400, 404, 426, 429, 500, 502][Math.floor(r() * 9)]
      const kind = Math.floor(r() * 4)
      const mk = (): Response => {
        const text = kind === 0 ? '{"broken":' : kind === 1 ? '' : JSON.stringify(randomJson(r)) ?? 'null'
        return new Response(text, { status, headers: { 'content-type': 'application/json' } })
      }
      const svc = service(mk)
      for (const run of [() => svc.siteCheck('abc'), () => svc.siteChecks(1, 'x')]) {
        const res = await run().catch((e) => { throw new Error(`threw: ${e}`) })
        expect(typeof res.ok).toBe('boolean')
        if (!res.ok) expect(typeof res.error).toBe('string')
      }
    }
  })

  it('a network failure is "network" and an invalid report is a short code, not a schema dump', async () => {
    const down = service(() => { throw new TypeError('fetch failed') })
    expect(await down.siteCheck('abc')).toEqual({ ok: false, error: 'network' })
    const bad = service(() => new Response(JSON.stringify({ report: 1 }), { status: 200 }))
    const res = await bad.siteCheck('abc')
    expect(res).toEqual({ ok: false, error: 'invalid_report' })
  })
})
