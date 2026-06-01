import { describe, it, expect } from 'vitest'
import { hasDebuggerAgentFlag, isSuspiciousMonoModule } from './mono-detector'

describe('hasDebuggerAgentFlag', () => {
  it('detects a mono soft-debugger agent on the command line', () => {
    expect(hasDebuggerAgentFlag('Unturned.exe --debugger-agent=transport=dt_socket,address=127.0.0.1:56000')).toBe(true)
  })
  it('is false for a normal command line', () => {
    expect(hasDebuggerAgentFlag('Unturned.exe -nographics')).toBe(false)
  })
})

describe('isSuspiciousMonoModule', () => {
  it('flags a mono dll loaded from a temp path', () => {
    expect(isSuspiciousMonoModule('mono-2.0-bdwgc.dll', 'c:\\\\users\\\\x\\\\appdata\\\\local\\\\temp\\\\mono-2.0-bdwgc.dll')).toBe(true)
  })
  it('does not flag mono from the game directory', () => {
    expect(isSuspiciousMonoModule('mono-2.0-bdwgc.dll', 'c:\\\\program files\\\\unturned\\\\monobleedingedge\\\\mono-2.0-bdwgc.dll')).toBe(false)
  })
  it('ignores non-mono modules', () => {
    expect(isSuspiciousMonoModule('kernel32.dll', 'c:\\\\windows\\\\temp\\\\kernel32.dll')).toBe(false)
  })
})
