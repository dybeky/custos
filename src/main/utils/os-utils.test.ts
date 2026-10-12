import { describe, it, expect } from 'vitest'
import { getWindowsVersionName } from './os-utils'

describe('getWindowsVersionName', () => {
  it('names Windows 11 feature updates by build', () => {
    expect(getWindowsVersionName(26200)).toBe('25H2')
    expect(getWindowsVersionName(26100)).toBe('24H2')
    expect(getWindowsVersionName(22631)).toBe('23H2')
    expect(getWindowsVersionName(22000)).toBe('21H2')
  })

  it('names Windows 10 feature updates, and nothing before 1709', () => {
    expect(getWindowsVersionName(19045)).toBe('22H2')
    expect(getWindowsVersionName(16299)).toBe('1709')
    expect(getWindowsVersionName(15063)).toBe('')
  })
})
