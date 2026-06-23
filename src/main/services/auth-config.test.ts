import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp' } }))

import { AuthConfigSchema } from './config-service'
import { resolveAuthConfig } from './config-service'

describe('AuthConfigSchema', () => {
  it('accepts a valid block', () => {
    const r = AuthConfigSchema.safeParse({ enabled: true, webBaseUrl: 'https://97437.dev' })
    expect(r.success).toBe(true)
  })
  it('rejects a non-url base', () => {
    expect(AuthConfigSchema.safeParse({ enabled: true, webBaseUrl: 'not a url' }).success).toBe(false)
  })
})

describe('resolveAuthConfig (env overrides)', () => {
  beforeEach(() => {
    delete process.env.WEB_BASE_URL
    delete process.env.DESKTOP_AUTH_ENABLED
  })
  it('uses the file block when no env override', () => {
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }))
      .toEqual({ enabled: true, webBaseUrl: 'https://97437.dev' })
  })
  it('WEB_BASE_URL env overrides the base', () => {
    process.env.WEB_BASE_URL = 'http://localhost:3000'
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }).webBaseUrl)
      .toBe('http://localhost:3000')
  })
  it('DESKTOP_AUTH_ENABLED=false env forces disabled', () => {
    process.env.DESKTOP_AUTH_ENABLED = 'false'
    expect(resolveAuthConfig({ enabled: true, webBaseUrl: 'https://97437.dev' }).enabled).toBe(false)
  })
})
