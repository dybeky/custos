import { describe, it, expect } from 'vitest'
import { isAllowedLocalPath } from './url-policy'

// Windows drops "." segments and trailing spaces/dots when it resolves a path,
// so "C:\x\evil.exe\." names the program itself: it must not pass as a folder.
describe('isAllowedLocalPath dot segments', () => {
  it.each([
    'C:\\Users\\Max\\Downloads\\evil.exe\\.',
    'C:\\Users\\Max\\Downloads\\evil.exe\\..\\evil.exe\\.',
    'C:\\Users\\Max\\Downloads\\evil.exe\\ ',
    'C:\\Users\\Max\\Downloads\\evil.exe/.',
    'C:\\Users\\Max\\Downloads\\..\\Downloads\\x.txt',
    'C:\\Users\\Max\\.\\Downloads'
  ])('rejects %s', (p) => {
    expect(isAllowedLocalPath(p)).toBe(false)
  })

  it('still allows ordinary folders and documents', () => {
    expect(isAllowedLocalPath('C:\\Users\\Max\\Downloads')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\Max\\Downloads\\')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\Max\\.ssh')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\Max\\notes.txt')).toBe(true)
    expect(isAllowedLocalPath('C:\\')).toBe(true)
  })
})
