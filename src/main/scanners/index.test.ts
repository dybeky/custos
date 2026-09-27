import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))

import { mergeKeywords } from './index'

describe('mergeKeywords', () => {
  const base = { patterns: ['aimbot', 'Undead'], exactMatch: ['esp'] }

  it('keeps bundled signatures and adds site ones without duplicates', () => {
    expect(mergeKeywords(base, { version: 3, patterns: ['undead', 'megacheat'], exactMatch: ['mc', 'ESP'], hashes: [] })).toEqual({
      patterns: ['aimbot', 'Undead', 'megacheat'],
      exactMatch: ['esp', 'mc']
    })
  })

  it('is the bundled set when the site added nothing', () => {
    expect(mergeKeywords(base, null)).toBe(base)
  })
})
