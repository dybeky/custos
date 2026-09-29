import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import {
  LOCK_DIR_NAME, SESSION_PREFIX, UPDATE_FILE_PREFIX, isLauncherDirName, isLegacyLogName, isSessionDirName, isUpdateFileName
} from './session-names'

describe('lock and launcher folder names', () => {
  it('never sweeps the lock folder as a session folder', () => {
    expect(isSessionDirName(LOCK_DIR_NAME)).toBe(false)
    expect(isLauncherDirName(LOCK_DIR_NAME)).toBe(false)
  })

  it('matches the portable launcher folder shape only', () => {
    expect(isLauncherDirName('3JyG3JBmonYk3Zo5C0d9RomnrJU')).toBe(true)
    expect(isLauncherDirName('custos-session-0123456789abcdef')).toBe(false)
    expect(isLauncherDirName('short')).toBe(false)
    expect(isLauncherDirName('has space in the name here')).toBe(false)
  })
})

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

  it('recognises only downloaded updates that never got swapped in', () => {
    expect(isUpdateFileName(UPDATE_FILE_PREFIX + randomBytes(8).toString('hex') + '.exe')).toBe(true)
    expect(isUpdateFileName('custos-update-0123456789abcdef')).toBe(false)
    expect(isUpdateFileName('custos-update-0123456789ABCDEF.exe')).toBe(false)
    expect(isUpdateFileName('custos-x64.exe')).toBe(false)
  })
})
