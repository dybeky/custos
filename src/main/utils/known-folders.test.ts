import { describe, it, expect } from 'vitest'
import { resolveKnownFolder } from './url-policy'

const profile = 'C:\\Users\\Max'
const lookup = (name: string): string => `C:\\Users\\Max\\OneDrive\\${name[0].toUpperCase()}${name.slice(1)}`

describe('resolveKnownFolder', () => {
  it('follows a Desktop moved into OneDrive', () => {
    expect(resolveKnownFolder('C:\\Users\\Max\\Desktop', profile, lookup)).toBe('C:\\Users\\Max\\OneDrive\\Desktop')
    expect(resolveKnownFolder('c:\\users\\max\\desktop\\', profile, lookup)).toBe('C:\\Users\\Max\\OneDrive\\Desktop')
  })

  it('keeps the sub-folders', () => {
    expect(resolveKnownFolder('C:\\Users\\Max\\Downloads\\Telegram Desktop', profile, lookup))
      .toBe('C:\\Users\\Max\\OneDrive\\Downloads\\Telegram Desktop')
  })

  it('leaves every other path alone', () => {
    expect(resolveKnownFolder('C:\\Users\\Max\\AppData\\Roaming', profile, lookup)).toBe('C:\\Users\\Max\\AppData\\Roaming')
    expect(resolveKnownFolder('C:\\Users\\Max\\DesktopStuff', profile, lookup)).toBe('C:\\Users\\Max\\DesktopStuff')
    expect(resolveKnownFolder('D:\\Desktop', profile, lookup)).toBe('D:\\Desktop')
  })

  it('keeps the path when the folder cannot be looked up', () => {
    const broken = (): string => { throw new Error('no such folder') }
    expect(resolveKnownFolder('C:\\Users\\Max\\Videos', profile, broken)).toBe('C:\\Users\\Max\\Videos')
    expect(resolveKnownFolder('C:\\Users\\Max\\Videos', undefined, lookup)).toBe('C:\\Users\\Max\\Videos')
  })
})
