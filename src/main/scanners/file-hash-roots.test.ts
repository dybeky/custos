import { describe, it, expect } from 'vitest'
import { fileHashRoots } from './file-hash-scanner'

describe('fileHashRoots', () => {
  it('covers Downloads and Desktop under the profile and under OneDrive', () => {
    const roots = fileHashRoots('C:\\Users\\Max', { OneDrive: 'C:\\Users\\Max\\OneDrive' }, 'C:\\Temp')
    expect(roots).toEqual([
      'C:\\Users\\Max\\Downloads',
      'C:\\Users\\Max\\Desktop',
      'C:\\Users\\Max\\OneDrive\\Downloads',
      'C:\\Users\\Max\\OneDrive\\Desktop',
      'C:\\Temp'
    ])
  })

  it('has no duplicates when the variables point at the same folder', () => {
    const env = { OneDrive: 'D:\\OD', OneDriveConsumer: 'D:\\OD' }
    expect(fileHashRoots('C:\\Users\\Max', env, 'C:\\Temp').filter((r) => r === 'D:\\OD\\Desktop')).toHaveLength(1)
  })

  it('works without OneDrive', () => {
    expect(fileHashRoots('C:\\Users\\Max', {}, 'C:\\Temp')).toHaveLength(3)
  })
})
