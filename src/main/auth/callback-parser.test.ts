import { describe, it, expect } from 'vitest'
import { parseCallback, findCallbackInArgv } from './callback-parser'

describe('parseCallback', () => {
  it('accepts a well-formed callback', () => {
    expect(parseCallback('custos://auth/callback?state=abc&code=xyz')).toEqual({ state: 'abc', code: 'xyz' })
  })
  it('rejects wrong scheme/host/path', () => {
    expect(parseCallback('https://auth/callback?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://evil/callback?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://auth/other?state=a&code=b')).toBeNull()
  })
  it('rejects missing or empty params', () => {
    expect(parseCallback('custos://auth/callback?state=a')).toBeNull()
    expect(parseCallback('custos://auth/callback?code=b')).toBeNull()
    expect(parseCallback('custos://auth/callback?state=&code=b')).toBeNull()
    expect(parseCallback('custos://auth/callback')).toBeNull()
  })
  it('rejects junk', () => {
    expect(parseCallback('not a url')).toBeNull()
    expect(parseCallback('')).toBeNull()
  })

  // Additional security-critical reject cases (binding constraints §4.6)
  it('rejects other schemes', () => {
    expect(parseCallback('http://auth/callback?state=a&code=b')).toBeNull()
    expect(parseCallback('evil://auth/callback?state=a&code=b')).toBeNull()
  })
  it('rejects other hosts/paths', () => {
    expect(parseCallback('custos://callback?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://auth?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://auth/callback/extra?state=a&code=b')).toBeNull()
    expect(parseCallback('custos://other?state=a&code=b')).toBeNull()
  })
  it('rejects empty code as well as empty state', () => {
    expect(parseCallback('custos://auth/callback?state=a&code=')).toBeNull()
    expect(parseCallback('custos://auth/callback?state=&code=')).toBeNull()
  })
  it('returns URL-decoded state and code values', () => {
    expect(parseCallback('custos://auth/callback?state=a%20b&code=c%2Fd')).toEqual({ state: 'a b', code: 'c/d' })
  })
})

describe('findCallbackInArgv', () => {
  it('finds the custos:// arg among Windows argv', () => {
    expect(findCallbackInArgv(['app.exe', '--flag', 'custos://auth/callback?state=a&code=b']))
      .toBe('custos://auth/callback?state=a&code=b')
  })
  it('returns null when absent', () => {
    expect(findCallbackInArgv(['app.exe', '--flag'])).toBeNull()
  })
})
