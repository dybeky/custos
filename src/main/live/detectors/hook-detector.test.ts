import { describe, it, expect } from 'vitest'
import { isHookedPrologue } from './hook-detector'

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
