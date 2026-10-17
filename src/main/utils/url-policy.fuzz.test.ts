import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl, isAllowedLocalPath, isAllowedAuthUrl, isValidRegistryKey, normalizeRevealPath } from './url-policy'
import { parseSteamTarget } from './steam-locator'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const BITS = [
  'C:', '\\', '/', '..', '.', ' ', ':', '$DATA', 'evil.exe', 'a.lnk', 'x.txt', 'file', '%TEMP%', '%', '\u0000', '\n', '\r', 'http', 'https://', 'file://',
  'javascript:', 'ms-msdt:', 'ms-settings:', 'HKCU', 'HKLM', 'Software', '?', '*', '"', '<', '>', '|', '@', 'ж', 'ß', '~1', 'CON', 'NUL'
]
function random(r: () => number, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += BITS[Math.floor(r() * BITS.length)]
  return s
}

const hasControl = (v: string): boolean => [...v].some((c) => c.charCodeAt(0) < 0x20)

describe('url and path policy fuzz', () => {
  it('never throws and only allows https / windowsdefender / ms-settings URLs', () => {
    const r = rng(11)
    for (let i = 0; i < 5000; i++) {
      const s = random(r, 1 + Math.floor(r() * 8))
      let allowed = false
      expect(() => { allowed = isAllowedExternalUrl(s) }).not.toThrow()
      if (allowed) expect(new URL(s).protocol).toMatch(/^(https|windowsdefender|ms-settings):$/)
    }
  })

  it('local paths: only a drive path with no control characters, streams, UNC or launchable names', () => {
    const r = rng(12)
    for (let i = 0; i < 20000; i++) {
      const s = random(r, 1 + Math.floor(r() * 8))
      let ok = false
      expect(() => { ok = isAllowedLocalPath(s) }).not.toThrow()
      if (!ok) continue
      const expanded = s.replace(/%([^%]+)%/g, (_, n: string) => process.env[n] || '')
      // an allowed value is a drive path or an allowed URL
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(expanded) && !/^[A-Za-z]:[\\/]/.test(expanded)) continue
      expect(expanded).toMatch(/^[A-Za-z]:[\\/]/)
      expect(expanded.slice(2)).not.toContain(':')
      expect(hasControl(expanded)).toBe(false)
      const last = expanded.split(/[\\/]/).filter(Boolean).pop()!.replace(/[\s.]+$/, '')
      if (last.lastIndexOf('.') > 0) expect(last).toMatch(/\.(txt|log|json|csv|md|pdf|png|jpe?g|gif|webp)$/i)
    }
  })

  it('refuses the launchable and tricky paths outright', () => {
    for (const p of [
      'C:\\x\\evil.exe', 'C:\\x\\evil.exe.', 'C:\\x\\evil.exe ', 'C:\\x\\evil.exe\\.', 'C:\\x\\a.lnk', 'C:\\x\\a.txt:evil.exe',
      '\\\\host\\share\\a.txt', '\\\\?\\C:\\a.txt', 'C:\\x\\a.txt\u0000.exe', 'C:\\x\\..\\evil.exe', 'C:evil.exe', 'ms-msdt:/id x', 'file:///C:/a.exe', 'C:\\x\\a.SCF'
    ]) expect(isAllowedLocalPath(p), p).toBe(false)
    expect(isAllowedLocalPath('C:\\Windows\\System32\\drivers\\etc')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\a\\notes.TXT')).toBe(true)
  })

  it('reveal path and registry key validators', () => {
    const r = rng(13)
    for (let i = 0; i < 5000; i++) {
      const s = random(r, 1 + Math.floor(r() * 8))
      expect(() => normalizeRevealPath(s)).not.toThrow()
      const n = normalizeRevealPath(s)
      if (n) expect(n).toMatch(/^[A-Za-z]:[\\/]/)
      if (isValidRegistryKey(s)) {
        expect(s).toMatch(/^(HKCU|HKLM|HKU|HKCR|HKCC|HKEY_[A-Z_]+)\\/i)
        expect(hasControl(s) || /["<>|*?:/]/.test(s)).toBe(false)
      }
    }
    expect(isValidRegistryKey('HKCU\\Software\\x\r\n/v')).toBe(false)
    expect(isValidRegistryKey('HKCU\\Software\\a\tb')).toBe(false)
  })

  it('auth URLs: a lookalike host or path is never allowed', () => {
    const base = 'https://97437.dev'
    for (const u of [
      'https://97437.dev.evil.com/device', 'https://evil.com/97437.dev/device', 'http://97437.dev/device', 'https://97437.dev/admin/reports/a/b',
      'https://97437.dev@evil.com/device', 'https://97437.dev:444/device', 'https://97437.dev/admin/reports/', 'https://97437.dev//device'
    ]) expect(isAllowedAuthUrl(u, base), u).toBe(false)
    expect(isAllowedAuthUrl('https://97437.dev/device', base)).toBe(true)
    const r = rng(14)
    for (let i = 0; i < 3000; i++) {
      const s = random(r, 6)
      expect(() => isAllowedAuthUrl(s, base)).not.toThrow()
    }
  })

  it('steam targets: random strings are null unless they are plain folder names', () => {
    const r = rng(15)
    for (let i = 0; i < 20000; i++) {
      const s = random(r, 1 + Math.floor(r() * 6))
      const t = parseSteamTarget(s)
      if (t === null) continue
      const names = t.kind === 'game' ? [t.game, ...t.sub] : t.sub
      for (const n of names) {
        expect(n).toMatch(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/)
        expect(n).not.toMatch(/[. ]$/)
      }
      expect(s).not.toMatch(/[\\:]/)
    }
    for (const bad of ['..', '../x', 'a/../b', 'a\\b', 'C:\\', '/etc', 'a//b', 'a/ ', 'a/b./', '@steam/..', '@steam', '.hidden']) {
      expect(parseSteamTarget(bad), bad).toBeNull()
    }
    expect(parseSteamTarget('')).toEqual({ kind: 'steam', sub: [] })
  })
})
