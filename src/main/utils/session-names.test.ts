import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { SESSION_PREFIX, isLegacyLogName, isSessionDirName } from './session-names'

describe('session folder names', () => {
  it('recognises the folders Custos creates', () => {
    expect(isSessionDirName(SESSION_PREFIX + randomBytes(8).toString('hex'))).toBe(true)
  })

  it('never matches anything else in %TEMP% (the sweep deletes what matches)', () => {
    for (const name of [
      'custos-session-',
      'custos-session-0123456789ABCDEF', // not our lowercase hex
      'custos-session-0123456789abcdef0',
      'custos-session-0123456789abcdef.bak',
      'x-custos-session-0123456789abcdef',
      'custos',
      '3JveLPnzJEF4oUOI2dMOJO0eppi', // the portable launcher's own folder
      'custos_chrome_History_1.db'
    ]) {
      expect(isSessionDirName(name)).toBe(false)
    }
  })

  it('recognises only the old next-to-exe log files', () => {
    expect(isLegacyLogName('custos-log-2026-09-27.txt')).toBe(true)
    expect(isLegacyLogName('custos-log-2026-09-27.txt.bak')).toBe(false)
    expect(isLegacyLogName('custos-x64.exe')).toBe(false)
    expect(isLegacyLogName('notes.txt')).toBe(false)
  })
})
