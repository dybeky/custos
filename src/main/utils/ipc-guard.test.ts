import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }))
vi.mock('../services/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }))

import { isTrustedSender } from './ipc-guard'
import { isTrustedRendererUrl } from './renderer-url'

const rules = { rendererIndex: 'C:\\app\\out\\renderer\\index.html', platform: 'win32' as const }
const check = (u: string): boolean => isTrustedRendererUrl(u, rules)

describe('isTrustedRendererUrl', () => {
  it('accepts only the bundled index.html (any hash route)', () => {
    expect(check('file:///C:/app/out/renderer/index.html#/results')).toBe(true)
    expect(check('FILE:///c:/APP/out/renderer/INDEX.html')).toBe(true)
  })
  it('rejects other files, schemes and junk', () => {
    expect(check('file:///C:/Users/x/Downloads/evil.html')).toBe(false)
    expect(check('https://example.com/')).toBe(false)
    expect(check('javascript:alert(1)')).toBe(false)
    expect(check('')).toBe(false)
    expect(check('not a url')).toBe(false)
  })
  it('in dev accepts the dev server origin only', () => {
    const dev = { ...rules, devUrl: 'http://localhost:5173/' }
    expect(isTrustedRendererUrl('http://localhost:5173/#/x', dev)).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:6000/', dev)).toBe(false)
  })
})

describe('isTrustedSender', () => {
  const ev = (frame: unknown) => ({ senderFrame: frame }) as never
  it('trusts the top frame of the app page', () => {
    expect(isTrustedSender(ev({ url: 'file:///C:/app/out/renderer/index.html', parent: null }), check)).toBe(true)
  })
  it('refuses foreign pages, child frames and missing frames', () => {
    expect(isTrustedSender(ev({ url: 'https://evil.example/', parent: null }), check)).toBe(false)
    expect(isTrustedSender(ev({ url: 'file:///C:/app/out/renderer/index.html', parent: {} }), check)).toBe(false)
    expect(isTrustedSender(ev(null), check)).toBe(false)
    expect(isTrustedSender(ev(undefined), check)).toBe(false)
    expect(isTrustedSender(ev({ url: 42, parent: null }), check)).toBe(false)
  })
})
