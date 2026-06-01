import { describe, it, expect } from 'vitest'
import { validateBatchPath, escapeBatchPath } from './self-destruct'

describe('validateBatchPath', () => {
  it('accepts an absolute windows path', () => {
    expect(() => validateBatchPath('C:\\Users\\x\\AppData\\Local\\Temp\\d.bat')).not.toThrow()
  })
  it('rejects control chars', () => {
    expect(() => validateBatchPath('C:\\xy\x00.bat')).toThrow()
  })
  it('rejects relative paths', () => {
    expect(() => validateBatchPath('..\\d.bat')).toThrow()
  })
})

describe('escapeBatchPath', () => {
  it('escapes batch metacharacters', () => {
    // '&' in input must become '^&'; the unescaped '&' must not appear alone
    const result = escapeBatchPath('C:\\a&b\\d.bat')
    expect(result).toContain('^&')
    expect(result).not.toMatch(/(?<!\^)&/)
  })
})
