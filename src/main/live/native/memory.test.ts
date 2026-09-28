import { describe, it, expect } from 'vitest'
import {
  close, findPatternIn, isMemoryNativeAvailable, listModules, listProcesses, listRegions,
  openGameProcess, readBuffer, scanPattern
} from './memory'
import { parseAobPattern } from '../signatures'

const pat = (s: string) => parseAobPattern(s) as (number | null)[]

describe('findPatternIn', () => {
  const buf = Uint8Array.from([0x00, 0x48, 0x8b, 0x05, 0x10, 0x20, 0x48, 0x8b, 0x0d, 0xff])

  it('finds an exact byte sequence', () => {
    expect(findPatternIn(buf, pat('48 8B 0D'))).toBe(6)
  })

  it('honours ?? wildcards', () => {
    expect(findPatternIn(buf, pat('48 8B ?? 10'))).toBe(1)
  })

  it('handles a pattern that starts with wildcards', () => {
    expect(findPatternIn(buf, pat('?? ?? 8B 0D'))).toBe(5)
  })

  it('returns -1 when absent or longer than the buffer, and matches at the very end', () => {
    expect(findPatternIn(buf, pat('DE AD'))).toBe(-1)
    expect(findPatternIn(Uint8Array.from([0x48]), pat('48 8B'))).toBe(-1)
    expect(findPatternIn(buf, pat('0D FF'))).toBe(8)
  })

  it('matches an all-wildcard pattern at 0', () => {
    expect(findPatternIn(buf, [null, null])).toBe(0)
  })
})

// On a Windows dev machine / CI runner the koffi layer must really work: the
// release build ships nothing else for Live Scan.
describe.runIf(process.platform === 'win32')('native process access (Windows)', () => {
  it('loads and lists running processes, including this one', () => {
    expect(isMemoryNativeAvailable()).toBe(true)
    const procs = listProcesses()
    expect(procs.length).toBeGreaterThan(5)
    expect(procs.some((p) => p.th32ProcessID === process.pid)).toBe(true)
  })

  it('opens a process, lists its modules, reads and scans its memory', () => {
    const proc = openGameProcess(process.pid)
    expect(proc).not.toBeNull()
    const handle = proc!.handle
    try {
      const mods = listModules(process.pid)
      const exe = mods.find((m) => m.szModule.toLowerCase().endsWith('.exe'))
      expect(exe).toBeDefined()
      // Every PE image starts with "MZ".
      expect(readBuffer(handle, exe!.modBaseAddr, 2)?.toString('latin1')).toBe('MZ')
      // A failed read is reported, not papered over with garbage.
      expect(readBuffer(handle, 0x10, 16)).toBeNull()
      expect(listRegions(handle).length).toBeGreaterThan(10)
      const hit = scanPattern(handle, exe!.szModule, '4D 5A ?? 00')
      expect(hit?.address).toBe(exe!.modBaseAddr)
    } finally {
      close(handle)
    }
  })
})
