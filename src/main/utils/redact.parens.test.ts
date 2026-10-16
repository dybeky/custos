import { describe, it, expect } from 'vitest'
import { hideProfileNames } from './redact'

describe('hideProfileNames with brackets in the account folder', () => {
  it('hides a whole name that has spaces and parentheses', () => {
    expect(hideProfileNames('C:\\Users\\John Doe (work)\\Downloads\\a.exe')).toBe('C:\\Users\\<user>\\Downloads\\a.exe')
    expect(hideProfileNames('file:///C:/Users/John Doe (2)/Downloads/a.exe')).toBe('file:///C:/Users/<user>/Downloads/a.exe')
  })

  it('does not swallow the closing bracket of surrounding text', () => {
    expect(hideProfileNames('(opened C:\\Users\\Max)')).toBe('(opened C:\\Users\\<user>)')
  })
})
