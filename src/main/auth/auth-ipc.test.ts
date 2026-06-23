import { describe, it, expect } from 'vitest'
import { AuthLoginPayloadSchema } from './auth-ipc-schema'

describe('AuthLoginPayloadSchema', () => {
  it('accepts the three valid providers', () => {
    for (const provider of ['google', 'github', 'device'] as const) {
      expect(AuthLoginPayloadSchema.safeParse({ provider }).success).toBe(true)
    }
  })
  it('rejects unknown providers and extra keys', () => {
    expect(AuthLoginPayloadSchema.safeParse({ provider: 'facebook' }).success).toBe(false)
    expect(AuthLoginPayloadSchema.safeParse({ provider: 'google', extra: 1 }).success).toBe(false)
    expect(AuthLoginPayloadSchema.safeParse({}).success).toBe(false)
  })
})
