import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'crypto'
import { bundleAdditions, verifyBundle } from './signature-bundle'

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return { privateKey, pub: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }
}

export function signed(payload: object, privateKey: ReturnType<typeof keys>['privateKey']) {
  const text = JSON.stringify(payload)
  return { payload: text, signature: sign(null, Buffer.from(text), privateKey).toString('base64') }
}

export const payload = (version: number, extra: object = {}) => ({
  format: 1,
  version,
  issuedAt: '2026-09-01T00:00:00.000Z',
  patterns: ['megacheat'],
  exactMatch: ['mc'],
  domains: ['cheat-shop.io'],
  hashes: [{ sha256: 'a'.repeat(64), name: 'Loader', source: 'https://example.com/x' }],
  ...extra
})

describe('verifyBundle', () => {
  it('accepts a bundle signed by the pinned key', () => {
    const { privateKey, pub } = keys()
    const b = verifyBundle(signed(payload(5), privateKey), pub)
    expect(b?.version).toBe(5)
    expect(bundleAdditions(b!)).toEqual({ patterns: ['megacheat', 'cheat-shop.io'], exactMatch: ['mc'], hashes: ['a'.repeat(64)] })
  })

  it('rejects tampered content, another key and a missing key', () => {
    const { privateKey, pub } = keys()
    const other = keys()
    const s = signed(payload(5), privateKey)
    expect(verifyBundle({ ...s, payload: s.payload.replace('megacheat', 'explorer') }, pub)).toBeNull()
    expect(verifyBundle(s, other.pub)).toBeNull()
    expect(verifyBundle(s, '')).toBeNull()
    expect(verifyBundle({ payload: s.payload, signature: 'bm9wZQ==' }, pub)).toBeNull()
  })

  it('rejects correctly signed but unsafe entries', () => {
    const { privateKey, pub } = keys()
    // A 2-letter pattern would match inside half of all file names.
    expect(verifyBundle(signed(payload(5, { patterns: ['ab'] }), privateKey), pub)).toBeNull()
    expect(verifyBundle(signed(payload(5, { hashes: [{ sha256: 'xyz', name: 'n', source: 's' }] }), privateKey), pub)).toBeNull()
    expect(verifyBundle(signed(payload(5, { format: 2 }), privateKey), pub)).toBeNull()
  })
})
