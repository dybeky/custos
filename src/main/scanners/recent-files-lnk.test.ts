import { describe, it, expect } from 'vitest'
import { encodeLnkPaths, parseLnkTargets } from './recent-files-scanner'

describe('shortcut resolver I/O', () => {
  it('sends paths as ASCII-only base64 of UTF-16, so non-ASCII folders survive', () => {
    const paths = ['C:\\Users\\Иван\\AppData\\Roaming\\Microsoft\\Windows\\Recent\\x.lnk', 'C:\\a.lnk']
    const input = encodeLnkPaths(paths)
    expect(/^[A-Za-z0-9+/=\n]+$/.test(input)).toBe(true)
    const decoded = input.trim().split('\n').map((l) => Buffer.from(l, 'base64').toString('utf16le'))
    expect(decoded).toEqual(paths)
  })

  it('reads targets keyed by line index and ignores anything else', () => {
    expect(parseLnkTargets('{"0":"D:\\\\Cheats\\\\aimbot.exe","2":"C:\\\\Игры\\\\x.exe","k":"y","3":""}')).toEqual([
      [0, 'D:\\Cheats\\aimbot.exe'],
      [2, 'C:\\Игры\\x.exe']
    ])
    expect(parseLnkTargets('')).toEqual([])
    expect(parseLnkTargets('{}')).toEqual([])
    expect(parseLnkTargets('not json')).toEqual([])
  })
})
