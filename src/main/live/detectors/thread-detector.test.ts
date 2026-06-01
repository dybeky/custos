import { describe, it, expect } from 'vitest'
import { isAddressInAnyModule, type ModuleRange } from './thread-detector'

const mods: ModuleRange[] = [
  { name: 'unturned.exe', base: 0x140000000, size: 0x100000 },
  { name: 'unityplayer.dll', base: 0x180000000, size: 0x500000 }
]

describe('isAddressInAnyModule', () => {
  it('is true for an address inside a module', () => {
    expect(isAddressInAnyModule(0x140000500, mods)).toBe(true)
  })
  it('is false for an address outside every module', () => {
    expect(isAddressInAnyModule(0x7ff000000, mods)).toBe(false)
  })
  it('treats the end boundary as exclusive', () => {
    expect(isAddressInAnyModule(0x140000000 + 0x100000, mods)).toBe(false)
  })
})
