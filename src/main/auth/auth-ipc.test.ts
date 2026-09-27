import { describe, it, expect } from 'vitest'
import { AuthLoginPayloadSchema, AuthUploadAvatarPayloadSchema, MAX_AVATAR_BYTES } from './auth-ipc-schema'

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

describe('AuthUploadAvatarPayloadSchema', () => {
  it('accepts a non-empty image within the size cap', () => {
    const r = AuthUploadAvatarPayloadSchema.safeParse({ bytes: new ArrayBuffer(1024), mime: 'image/webp' })
    expect(r.success).toBe(true)
  })
  it('rejects empty and oversized payloads', () => {
    expect(AuthUploadAvatarPayloadSchema.safeParse({ bytes: new ArrayBuffer(0), mime: 'image/webp' }).success).toBe(false)
    expect(
      AuthUploadAvatarPayloadSchema.safeParse({ bytes: new ArrayBuffer(MAX_AVATAR_BYTES + 1), mime: 'image/png' }).success
    ).toBe(false)
  })
  it('rejects unsupported mime types and extra keys', () => {
    expect(AuthUploadAvatarPayloadSchema.safeParse({ bytes: new ArrayBuffer(8), mime: 'image/svg+xml' }).success).toBe(false)
    expect(AuthUploadAvatarPayloadSchema.safeParse({ bytes: new ArrayBuffer(8), mime: 'image/png', x: 1 }).success).toBe(false)
  })
})
