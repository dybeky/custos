import { describe, it, expect } from 'vitest'
import { isAllowedExternalUrl, isAllowedLocalPath, expandEnv } from './url-policy'

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
})
