import { describe, it, expect, vi, beforeEach } from 'vitest'

// fs is mocked so writes never touch disk and can be made to fail on demand.
const { writeFileSync, appendFileSync, existsSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => false)
}))
vi.mock('fs', () => ({ writeFileSync, appendFileSync, existsSync }))

// electron is only used to locate the log path / app version.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getVersion: () => '1.0.0' }
}))

import { Logger } from './logger'

describe('Logger file writing', () => {
  beforeEach(() => {
    writeFileSync.mockReset().mockImplementation(() => {})
    appendFileSync.mockReset().mockImplementation(() => {})
  })

  it('does not recurse infinitely when the log file is not writable', () => {
    // A read-only install dir / full disk makes the header write throw. The
    // failing batch must be dropped, not retried forever (stack overflow).
    writeFileSync.mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    })
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const log = new Logger()
    log.init()

    expect(() => log.error('a genuine error being logged must not crash the app')).not.toThrow()
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })

  it('writes the header once then appends the entry on success', () => {
    const log = new Logger()
    log.init()

    log.error('first error')

    expect(writeFileSync).toHaveBeenCalledTimes(1) // header
    expect(appendFileSync).toHaveBeenCalledTimes(1) // batched entry
  })
})
