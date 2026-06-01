/**
 * Unit tests for pure live-scan logic.
 *
 * None of these tests import any native module (memoryjs, koffi) — they only
 * exercise functions whose inputs and outputs are plain JS values.
 *
 * Covered:
 *   - classifyModule   (injected-module-detector)
 *   - isSuspiciousRegion (injected-module-detector)
 *   - parseAobPattern  (signatures)
 *   - loadSignatures fallback (signatures, no real file system needed)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { classifyModule, isSuspiciousRegion } from './detectors/injected-module-detector'
import { parseAobPattern, _resetSignatureCache, loadSignatures } from './signatures'
import { EXEC_PROTECTIONS, MEM_PRIVATE } from './native/memory'

// ── classifyModule ────────────────────────────────────────────────────────────

describe('classifyModule', () => {
  const allowlist = new Set(['unturned.exe', 'unityplayer.dll', 'steam_api64.dll'])
  const denylist  = new Set(['hackdll.dll', 'aim_pro.dll'])

  it('returns null for modules on the allowlist', () => {
    expect(classifyModule('unturned.exe', 'C:\\Game\\unturned.exe', allowlist, denylist)).toBeNull()
    expect(classifyModule('UNITYPLAYER.DLL', 'C:\\Game\\UnityPlayer.dll', allowlist, denylist)).toBeNull()
  })

  it('flags modules on the denylist as suspicious (high confidence)', () => {
    const result = classifyModule('hackdll.dll', 'C:\\Temp\\hackdll.dll', allowlist, denylist)
    expect(result).not.toBeNull()
    expect(result?.suspicious).toBe(true)
    expect(result?.reason).toMatch(/denylist/i)
  })

  it('flags modules with cheat keywords in name as suspicious', () => {
    const result = classifyModule('aimbot_v2.dll', 'C:\\Games\\aimbot_v2.dll', allowlist, denylist)
    expect(result).not.toBeNull()
    expect(result?.suspicious).toBe(true)
    expect(result?.reason).toMatch(/cheat keyword/i)
  })

  it('flags modules with no on-disk path (manual map indicator)', () => {
    const result = classifyModule('unknownmod.dll', '', allowlist, denylist)
    expect(result).not.toBeNull()
    expect(result?.suspicious).toBe(true)
    expect(result?.reason).toMatch(/no on-disk path/i)
  })

  it('flags modules loaded from suspicious temp path', () => {
    const result = classifyModule(
      'overlay.dll',
      'C:\\Users\\Foo\\AppData\\Local\\Temp\\overlay.dll',
      allowlist,
      denylist
    )
    expect(result).not.toBeNull()
    expect(result?.suspicious).toBe(true)
    expect(result?.reason).toMatch(/suspicious path/i)
  })

  it('returns non-null but suspicious=false for unknown module in normal path', () => {
    const result = classifyModule(
      'someplugin.dll',
      'C:\\Program Files\\Some Tool\\someplugin.dll',
      allowlist,
      denylist
    )
    expect(result).not.toBeNull()
    // Not on allowlist but no hard evidence of cheat
    expect(result?.suspicious).toBe(false)
  })

  it('is case-insensitive for allowlist matching', () => {
    expect(classifyModule('STEAM_API64.DLL', 'C:\\Game\\Steam_API64.DLL', allowlist, denylist)).toBeNull()
  })

  it('is case-insensitive for denylist matching', () => {
    const result = classifyModule('HACKdll.DLL', 'C:\\somewhere\\HACKdll.DLL', allowlist, denylist)
    expect(result?.suspicious).toBe(true)
  })

  it('detects multiple cheat keywords: esp, wallhack, injector', () => {
    for (const kw of ['esp_mod', 'wallhack64', 'injector_helper']) {
      const r = classifyModule(`${kw}.dll`, `C:\\Games\\${kw}.dll`, allowlist, denylist)
      expect(r?.suspicious, `keyword in ${kw}`).toBe(true)
    }
  })
})

// ── isSuspiciousRegion ────────────────────────────────────────────────────────

describe('isSuspiciousRegion', () => {
  const PAGE_EXECUTE             = 0x10
  const PAGE_EXECUTE_READ        = 0x20
  const PAGE_EXECUTE_READWRITE   = 0x40
  const PAGE_EXECUTE_WRITECOPY   = 0x80
  const PAGE_READONLY            = 0x02
  const MEM_IMAGE                = 0x1000000
  const MEM_MAPPED               = 0x40000

  it('flags MEM_PRIVATE + PAGE_EXECUTE_READ as suspicious', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE_READ, EXEC_PROTECTIONS)).toBe(true)
  })

  it('flags MEM_PRIVATE + PAGE_EXECUTE as suspicious', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE, EXEC_PROTECTIONS)).toBe(true)
  })

  it('flags MEM_PRIVATE + PAGE_EXECUTE_READWRITE as suspicious', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE_READWRITE, EXEC_PROTECTIONS)).toBe(true)
  })

  it('flags MEM_PRIVATE + PAGE_EXECUTE_WRITECOPY as suspicious', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_EXECUTE_WRITECOPY, EXEC_PROTECTIONS)).toBe(true)
  })

  it('does NOT flag MEM_IMAGE + PAGE_EXECUTE_READ (normal mapped DLL)', () => {
    expect(isSuspiciousRegion(MEM_IMAGE, PAGE_EXECUTE_READ, EXEC_PROTECTIONS)).toBe(false)
  })

  it('does NOT flag MEM_MAPPED + PAGE_EXECUTE_READ', () => {
    expect(isSuspiciousRegion(MEM_MAPPED, PAGE_EXECUTE_READ, EXEC_PROTECTIONS)).toBe(false)
  })

  it('does NOT flag MEM_PRIVATE + PAGE_READONLY (non-exec private memory is normal)', () => {
    expect(isSuspiciousRegion(MEM_PRIVATE, PAGE_READONLY, EXEC_PROTECTIONS)).toBe(false)
  })

  it('uses custom exec-protections set correctly', () => {
    const customExec = new Set([0x20]) // only PAGE_EXECUTE_READ
    expect(isSuspiciousRegion(MEM_PRIVATE, 0x20, customExec)).toBe(true)
    expect(isSuspiciousRegion(MEM_PRIVATE, 0x40, customExec)).toBe(false)
  })
})

// ── parseAobPattern ───────────────────────────────────────────────────────────

describe('parseAobPattern', () => {
  it('parses a simple hex pattern', () => {
    expect(parseAobPattern('48 8B C0')).toEqual([0x48, 0x8B, 0xC0])
  })

  it('parses wildcard ?? as null', () => {
    expect(parseAobPattern('48 ?? C0')).toEqual([0x48, null, 0xC0])
  })

  it('parses single ? as null', () => {
    expect(parseAobPattern('48 ? C0')).toEqual([0x48, null, 0xC0])
  })

  it('handles all-wildcard patterns', () => {
    expect(parseAobPattern('?? ?? ??')).toEqual([null, null, null])
  })

  it('handles mixed case hex (E8 vs e8)', () => {
    expect(parseAobPattern('E8 e8')).toEqual([0xE8, 0xE8])
  })

  it('handles leading/trailing whitespace', () => {
    expect(parseAobPattern('  48 8B  ')).toEqual([0x48, 0x8B])
  })

  it('returns null for invalid hex token', () => {
    expect(parseAobPattern('48 GG C0')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAobPattern('')).toBeNull()
  })

  it('returns null for out-of-range byte (0x100)', () => {
    expect(parseAobPattern('100')).toBeNull()
  })

  it('correctly identifies single-byte pattern', () => {
    expect(parseAobPattern('90')).toEqual([0x90])
  })
})

// ── loadSignatures (fallback) ─────────────────────────────────────────────────

describe('loadSignatures (fallback)', () => {
  beforeEach(() => {
    _resetSignatureCache()
  })

  it('falls back to default when path does not exist', () => {
    const sigs = loadSignatures('/nonexistent/path/that/does/not/exist')
    expect(sigs.aob).toEqual([])
    expect(sigs.moduleDenylist).toEqual([])
    expect(sigs.moduleAllowlist.length).toBeGreaterThan(0)
    expect(sigs.moduleAllowlist).toContain('unturned.exe')
    expect(sigs.moduleAllowlist).toContain('unityplayer.dll')
  })

  it('all allowlist entries are lowercased', () => {
    const sigs = loadSignatures('/nonexistent')
    for (const entry of sigs.moduleAllowlist) {
      expect(entry).toBe(entry.toLowerCase())
    }
  })
})
