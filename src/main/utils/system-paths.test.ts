import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { resolveSystemTool, system32Dir, systemRoot, withSystemPowershell } from './system-paths'

describe('systemRoot', () => {
  it('prefers SystemRoot, then windir, then the default', () => {
    expect(systemRoot({ SystemRoot: 'D:\\Win', windir: 'E:\\W' })).toBe('D:\\Win')
    expect(systemRoot({ windir: 'E:\\W' })).toBe('E:\\W')
    expect(systemRoot({})).toBe('C:\\Windows')
  })
})

describe.runIf(process.platform === 'win32')('resolveSystemTool (Windows)', () => {
  it('pins bare tool names to System32, never the current folder', () => {
    expect(resolveSystemTool('reg').toLowerCase()).toBe(join(system32Dir(), 'reg.exe').toLowerCase())
    expect(resolveSystemTool('tasklist.exe').toLowerCase()).toBe(join(system32Dir(), 'tasklist.exe').toLowerCase())
  })

  it('maps powershell to Windows PowerShell under System32', () => {
    expect(resolveSystemTool('powershell').toLowerCase()).toMatch(/\\system32\\windowspowershell\\v1\.0\\powershell\.exe$/)
    expect(resolveSystemTool('PowerShell.exe').toLowerCase()).toMatch(/\\windowspowershell\\v1\.0\\powershell\.exe$/)
  })

  it('leaves paths and unknown tools alone', () => {
    expect(resolveSystemTool('C:\\tools\\x.exe')).toBe('C:\\tools\\x.exe')
    expect(resolveSystemTool('no-such-tool-xyz')).toBe('no-such-tool-xyz')
  })

  it('rewrites only a leading powershell in a shell command', () => {
    const cmd = withSystemPowershell('powershell -NoProfile -Command "Get-Date"')
    expect(cmd).toMatch(/^"[^"]+\\powershell\.exe" -NoProfile -Command "Get-Date"$/i)
    expect(withSystemPowershell('tasklist /FO CSV')).toBe('tasklist /FO CSV')
    expect(withSystemPowershell('powershellx -a')).toBe('powershellx -a')
  })
})
