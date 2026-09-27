import { describe, it, expect } from 'vitest'
import { extractLocalPath } from './report-view'

describe('extractLocalPath', () => {
  it.each([
    ['C:\\Users\\p\\AppData\\Roaming\\undead', 'C:\\Users\\p\\AppData\\Roaming\\undead'],
    ['C:\\Windows\\Prefetch\\UNDEAD.EXE-1A2B3C4D.pf | last run 27/09/2026, 12:30', 'C:\\Windows\\Prefetch\\UNDEAD.EXE-1A2B3C4D.pf'],
    ['C:\\Users\\p\\Downloads\\undead.exe [sha256:abcdef0123456789…] (keyword)', 'C:\\Users\\p\\Downloads\\undead.exe'],
    ['[BAM] C:\\Games\\Cheats\\undead loader.exe | 27/09/2026, 12:30', 'C:\\Games\\Cheats\\undead loader.exe'],
    ['C:\\Users\\p\\Recent\\x.lnk -> D:\\tools\\undead.exe', 'D:\\tools\\undead.exe'],
    ['[Process] undead.exe (PID: 42)\n    Path: C:\\t\\undead.exe', 'C:\\t\\undead.exe']
  ])('%s', (value, expected) => {
    expect(extractLocalPath(value)).toBe(expected)
  })

  it('returns null for findings without a local path', () => {
    expect(extractLocalPath('[DNS Cache] {undead} undead.pro (A)')).toBeNull()
    expect(extractLocalPath('[Steam Account] p (SteamID: 1)')).toBeNull()
    expect(extractLocalPath('https://undead.pro/download')).toBeNull()
  })
})
