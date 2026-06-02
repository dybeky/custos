import { describe, it, expect } from 'vitest'
import { isAddressInAnyModule, type ModuleRange } from './thread-detector'

const mods: ModuleRange[] = [
  { name: 'game.exe', base: 0x140000000n, size: 0x100000n },
  { name: 'unityplayer.dll', base: 0x180000000n, size: 0x200000n }
]

describe('isAddressInAnyModule', () => {
  it('true inside a module range, false outside', () => {
    expect(isAddressInAnyModule(0x140000500n, mods)).toBe(true)
    expect(isAddressInAnyModule(0x500000000n, mods)).toBe(false)
  })
  it('matches against the second module too', () => {
    expect(isAddressInAnyModule(0x180000010n, mods)).toBe(true)
  })
  it('treats the start as inclusive and the end as exclusive', () => {
    expect(isAddressInAnyModule(0x140000000n, mods)).toBe(true)               // base: inclusive
    expect(isAddressInAnyModule(0x140000000n + 0x100000n, mods)).toBe(false)  // base+size: exclusive
    expect(isAddressInAnyModule(0x140000000n + 0xfffffn, mods)).toBe(true)    // last byte in range
  })
})
