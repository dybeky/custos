import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl, isAllowedLocalPath, expandEnv } from './url-policy'

const NUL = String.fromCharCode(0)

describe('isAllowedExternalUrl', () => {
  it('allows https, ms-settings and windowsdefender schemes', () => {
    expect(isAllowedExternalUrl('https://github.com/dybeky/custos')).toBe(true)
    expect(isAllowedExternalUrl('ms-settings:datausage')).toBe(true)
    expect(isAllowedExternalUrl('windowsdefender:')).toBe(true)
  })
  it('rejects dangerous schemes and junk', () => {
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false)
    expect(isAllowedExternalUrl('ms-msdt:/id PCWDiagnostic')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('http://insecure.example')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})

describe('expandEnv', () => {
  it('expands %VAR% from process.env', () => {
    process.env.CUSTOS_TEST_VAR = 'C:\\Users\\x'
    expect(expandEnv('%CUSTOS_TEST_VAR%\\Downloads')).toBe('C:\\Users\\x\\Downloads')
  })
})

describe('isAllowedLocalPath', () => {
  it('allows drive-letter directories', () => {
    expect(isAllowedLocalPath('C:\\Windows\\Prefetch')).toBe(true)
    expect(isAllowedLocalPath('C:\\Program Files (x86)\\Steam')).toBe(true)
  })
  it('delegates URI schemes to the external policy', () => {
    expect(isAllowedLocalPath('ms-settings:datausage')).toBe(true)
    expect(isAllowedLocalPath('windowsdefender:')).toBe(true)
  })
  it('rejects UNC paths and executables', () => {
    expect(isAllowedLocalPath('\\\\attacker\\share\\evil.exe')).toBe(false)
    expect(isAllowedLocalPath('C:\\Windows\\System32\\cmd.exe')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\payload.bat')).toBe(false)
    expect(isAllowedLocalPath('C:\\x\\run.ps1')).toBe(false)
    expect(isAllowedLocalPath('ms-msdt:/id PCWDiagnostic')).toBe(false)
  })
  it('rejects executables disguised with a trailing space or dot (Windows strips them on launch)', () => {
    expect(isAllowedLocalPath('C:\\tmp\\payload.exe ')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\payload.exe.')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\payload.exe.  .')).toBe(false)
    expect(isAllowedLocalPath('C:\\x\\run.bat ')).toBe(false)
  })
  it('rejects executables hidden behind a trailing path separator', () => {
    expect(isAllowedLocalPath('C:\\x\\payload.exe\\')).toBe(false)
    expect(isAllowedLocalPath('C:\\x\\payload.exe \\')).toBe(false)
    expect(isAllowedLocalPath('C:/x/payload.exe/')).toBe(false)
  })
  it('rejects NTFS alternate-data-stream paths (a colon past the drive letter)', () => {
    expect(isAllowedLocalPath('C:\\tmp\\payload.exe::$DATA')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\notes.txt:hidden.exe')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\notes.txt:stream')).toBe(false)
  })
  it('rejects an embedded NUL (ShellExecuteW truncates the path at it)', () => {
    expect(isAllowedLocalPath('C:\\tmp\\payload.exe' + NUL + '.txt')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\folder' + NUL)).toBe(false)
  })
  it('rejects ShellExecute-launchable extensions beyond classic executables', () => {
    expect(isAllowedLocalPath('C:\\tmp\\shortcut.url')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\evil.scf')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\evil.settingcontent-ms')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\evil.appref-ms')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\help.chm')).toBe(false)
    expect(isAllowedLocalPath('C:\\tmp\\thing.msc')).toBe(false)
  })
  it('still allows legitimate directories (incl. hidden) and inert documents', () => {
    expect(isAllowedLocalPath('C:\\Users\\me\\report.txt')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\me\\Documents')).toBe(true)
    expect(isAllowedLocalPath('C:/Users/me/notes.log')).toBe(true)
    expect(isAllowedLocalPath('C:\\Windows\\Prefetch')).toBe(true)
    expect(isAllowedLocalPath('C:\\Users\\me\\.ssh')).toBe(true)
    expect(isAllowedLocalPath('C:\\Program Files (x86)\\Steam')).toBe(true)
  })
})
