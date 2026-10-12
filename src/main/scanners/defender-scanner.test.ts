import { describe, it, expect, vi } from 'vitest'

const out = vi.hoisted(() => ({ stdout: '', stderr: '' }))
vi.mock('../utils/async-exec', () => ({ execFileAsync: async () => ({ ...out }) }))

import { DefenderScanner } from './defender-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

const scanner = (): DefenderScanner =>
  new DefenderScanner(new KeywordMatcher({ patterns: ['aimbot'], exactMatch: [] }), { excludedDirectories: [] } as never)

describe('DefenderScanner', () => {
  it('reports an unreadable history as a failed check, not a clean one', async () => {
    out.stdout = ''
    out.stderr = 'Failed to query log. Access is denied.'
    const r = await scanner().scan()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/Access is denied/)
  })

  it('treats a readable history with no detections as clean', async () => {
    out.stdout = ''
    out.stderr = ''
    const r = await scanner().scan()
    expect(r.success).toBe(true)
    expect(r.findings).toEqual([])
  })
})
