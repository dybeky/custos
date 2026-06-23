import { describe, it, expect } from 'vitest'
import { randomUrlSafe, generateState, generatePkce, sha256Base64Url } from './pkce'

const B64URL = /^[A-Za-z0-9_-]+$/

describe('pkce', () => {
  it('randomUrlSafe produces padding-free base64url', () => {
    const s = randomUrlSafe(32)
    expect(s).toMatch(B64URL)
    expect(s).not.toContain('=')
    expect(s.length).toBeGreaterThanOrEqual(43)
  })

  it('generateState is unique and url-safe', () => {
    expect(generateState()).toMatch(B64URL)
    expect(generateState()).not.toBe(generateState())
  })

  it('generatePkce derives an S256 challenge from the verifier', () => {
    const { codeVerifier, codeChallenge } = generatePkce()
    expect(codeVerifier).toMatch(B64URL)
    expect(codeChallenge).toMatch(B64URL)
    expect(codeChallenge).toBe(sha256Base64Url(codeVerifier))
  })

  it('sha256Base64Url matches a known vector', () => {
    // base64url(sha256("abc")) with padding stripped
    expect(sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
  })
})
