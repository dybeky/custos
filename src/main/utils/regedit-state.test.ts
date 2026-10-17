import { describe, expect, it } from 'vitest'
import { parseLastKey } from './regedit-state'

describe('parseLastKey', () => {
  it('reads the value out of reg query output', () => {
    const out =
      '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit\r\n' +
      '    LastKey    REG_SZ    Computer\\HKEY_CURRENT_USER\\Software\\Foo\r\n\r\n'
    expect(parseLastKey(out)).toBe('Computer\\HKEY_CURRENT_USER\\Software\\Foo')
  })
  it('is null when there is no LastKey', () => {
    expect(parseLastKey('')).toBeNull()
    expect(parseLastKey('    Other    REG_SZ    x')).toBeNull()
  })
})
