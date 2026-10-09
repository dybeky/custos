import { describe, it, expect } from 'vitest'
import { isHookedPrologue, exportsValidInTarget, isHookCheckSupported, isGameHook } from './hook-detector'

describe('exportsValidInTarget', () => {
  const exps = [
    { module: 'ntdll.dll', fn: 'NtOpenProcess', address: 0x7ff800001000n },
    { module: 'user32.dll', fn: 'GetAsyncKeyState', address: 0x7ff900000500n }
  ]

  it('keeps exports whose address falls within the matching target module range', () => {
    const mods = [{ name: 'ntdll.dll', base: 0x7ff800000000, size: 0x200000 }]
    expect(exportsValidInTarget(exps, mods).map((e) => e.fn)).toEqual(['NtOpenProcess'])
  })

  it('drops exports whose owning module is not loaded in the target', () => {
    expect(exportsValidInTarget(exps, [])).toEqual([])
  })

  it('drops exports whose address is outside the target module range (different base / bitness)', () => {
    // ntdll loaded at a different base in the target (e.g. 32-bit WoW64): our
    // 64-bit-resolved address is not within the target's ntdll mapping.
    const mods = [{ name: 'ntdll.dll', base: 0x10000000, size: 0x200000 }]
    expect(exportsValidInTarget(exps, mods)).toEqual([])
  })

  it('matches module names case-insensitively', () => {
    const mods = [{ name: 'NTDLL.DLL', base: 0x7ff800000000, size: 0x200000 }]
    expect(exportsValidInTarget(exps, mods).map((e) => e.fn)).toEqual(['NtOpenProcess'])
  })
})

describe('isHookedPrologue', () => {
  it('flags an E9 near-jmp trampoline', () => {
    expect(isHookedPrologue(Buffer.from([0xe9, 0x12, 0x34, 0x56, 0x78]))).toBe(true)
  })
  it('flags an FF25 indirect jmp', () => {
    expect(isHookedPrologue(Buffer.from([0xff, 0x25, 0x00, 0x00, 0x00, 0x00]))).toBe(true)
  })
  it('flags a push/ret trampoline (68 .. C3)', () => {
    expect(isHookedPrologue(Buffer.from([0x68, 0x00, 0x10, 0x40, 0x00, 0xc3]))).toBe(true)
  })
  it('does not flag a normal prologue', () => {
    // mov rdi, rdi ; push rbp ; mov rbp, rsp
    expect(isHookedPrologue(Buffer.from([0x48, 0x89, 0xff, 0x55, 0x48, 0x8b, 0xec]))).toBe(false)
  })
  it('is false for an empty buffer', () => {
    expect(isHookedPrologue(Buffer.from([]))).toBe(false)
  })
})

describe('isHookCheckSupported', () => {
  it('only supports x64 builds (patterns are x64 instruction encodings)', () => {
    expect(isHookCheckSupported('x64')).toBe(true)
    expect(isHookCheckSupported('arm64')).toBe(false)
    expect(isHookCheckSupported('ia32')).toBe(false)
  })
})

describe('isGameHook', () => {
  const jmp = Buffer.from([0xe9, 1, 2, 3, 4, 0x90, 0x90, 0x90])
  const stock = Buffer.from([0x4c, 0x8b, 0xd1, 0xb8, 0x26, 0, 0, 0])

  it('reports a trampoline that only the game has', () => {
    expect(isGameHook(jmp, stock)).toBe(true)
  })

  it('ignores code identical in Custos (forwarder stub or system-wide patch)', () => {
    expect(isGameHook(jmp, Buffer.from(jmp))).toBe(false)
  })

  it('ignores stock code, and falls back to the pattern without our own bytes', () => {
    expect(isGameHook(stock, jmp)).toBe(false)
    expect(isGameHook(jmp, null)).toBe(true)
  })
})
