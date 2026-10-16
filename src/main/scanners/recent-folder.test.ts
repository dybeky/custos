import { describe, it, expect } from 'vitest'
import { recentFolderPath } from './recent-files-scanner'

describe('recentFolderPath', () => {
  it('follows a redirected %APPDATA%', () => {
    expect(recentFolderPath({ APPDATA: 'D:\\Roaming' }, 'C:\\Users\\Max')).toBe('D:\\Roaming\\Microsoft\\Windows\\Recent')
  })

  it('falls back to the profile', () => {
    expect(recentFolderPath({}, 'C:\\Users\\Max')).toBe('C:\\Users\\Max\\AppData\\Roaming\\Microsoft\\Windows\\Recent')
  })
})
