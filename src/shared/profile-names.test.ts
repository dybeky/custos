import { describe, expect, it } from 'vitest'
import { hideProfileNames } from './profile-names'

describe('hideProfileNames: network admin shares', () => {
  it('hides the account name behind \\\\PC\\C$', () => {
    expect(hideProfileNames('\\\\DESKTOP-1\\C$\\Users\\Ivan\\Downloads\\a.exe')).toBe('\\\\DESKTOP-1\\C$\\Users\\<user>\\Downloads\\a.exe')
    expect(hideProfileNames('//pc/d$/users/Ivan Petrov/x.dll')).toBe('//pc/d$/users/<user>/x.dll')
    expect(hideProfileNames('\\\\?\\UNC\\PC\\C$\\Users\\Ivan\\x')).toBe('\\\\?\\UNC\\PC\\C$\\Users\\<user>\\x')
  })
  it('keeps shared profiles and local forms working', () => {
    expect(hideProfileNames('\\\\PC\\C$\\Users\\Public\\x')).toBe('\\\\PC\\C$\\Users\\Public\\x')
    expect(hideProfileNames('C:\\Users\\Ivan\\x')).toBe('C:\\Users\\<user>\\x')
    expect(hideProfileNames('\\Device\\HarddiskVolume3\\Users\\Ivan\\x')).toBe('\\Device\\HarddiskVolume3\\Users\\<user>\\x')
  })
})
