import { describe, it, expect, vi } from 'vitest'
import { TokenStore } from './token-store'
import type { PublicUser } from '../../shared/types'

function fakeStore() {
  let rec: any = undefined
  return {
    get: vi.fn(() => rec),
    set: vi.fn((_k: string, v: any) => { rec = v }),
    delete: vi.fn(() => { rec = undefined })
  }
}
// XOR-with-marker "encryption" so we can assert ciphertext != plaintext.
const realSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from('enc:' + s, 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, '')
}
const user: PublicUser = { id: 'u1', username: 'neo', uid: 7, avatarVersion: 1, role: null, status: 'active' }

describe('TokenStore (encryption available)', () => {
  it('round-trips a token without persisting plaintext', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: realSafe, store })
    expect(ts.save('secret-bearer')).toBe(true)
    const persisted = JSON.stringify(store.set.mock.calls[0][1])
    expect(persisted).not.toContain('secret-bearer') // base64 of ciphertext only
    expect(ts.load()).toBe('secret-bearer')
  })
  it('clear wipes token and user', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: realSafe, store })
    ts.save('t'); ts.saveUser(user)
    ts.clear()
    expect(ts.load()).toBeNull()
    expect(ts.loadUser()).toBeNull()
  })
})

describe('TokenStore (encryption UNAVAILABLE — fail closed)', () => {
  const noSafe = { ...realSafe, isEncryptionAvailable: () => false }
  it('keeps token memory-only and never writes tokenEnc', () => {
    const store = fakeStore()
    const ts = new TokenStore({ safeStorage: noSafe, store })
    expect(ts.save('secret')).toBe(false)
    // current run can still use it from memory
    expect(ts.load()).toBe('secret')
    // but nothing was persisted to disk
    const lastSet = store.set.mock.calls.at(-1)?.[1]
    expect(lastSet?.tokenEnc).toBeUndefined()
  })
})
