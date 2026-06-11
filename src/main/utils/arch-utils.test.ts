// src/main/utils/arch-utils.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeWindowsArch, parseRegArchOutput, resolveArchInfo } from './arch-utils'

describe('normalizeWindowsArch', () => {
  it('maps Windows arch identifiers to CpuArch', () => {
    expect(normalizeWindowsArch('AMD64')).toBe('x64')
    expect(normalizeWindowsArch('amd64')).toBe('x64')
    expect(normalizeWindowsArch('ARM64')).toBe('arm64')
    expect(normalizeWindowsArch('x86')).toBe('ia32')
    expect(normalizeWindowsArch('')).toBe('unknown')
    expect(normalizeWindowsArch(undefined)).toBe('unknown')
    expect(normalizeWindowsArch('IA64')).toBe('unknown')
  })
})

describe('parseRegArchOutput', () => {
  it('extracts the arch from reg query output', () => {
    const out =
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\r\n' +
      '    PROCESSOR_ARCHITECTURE    REG_SZ    ARM64\r\n'
    expect(parseRegArchOutput(out)).toBe('arm64')
  })
  it('returns unknown for empty/garbage output', () => {
    expect(parseRegArchOutput('')).toBe('unknown')
    expect(parseRegArchOutput('ERROR: The system was unable to find the key')).toBe('unknown')
  })
})

describe('resolveArchInfo', () => {
  it('x64 app on x64 OS — not emulated', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: undefined, registryArch: 'x64' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'x64', isEmulated: false })
  })
  it('x64 app on ARM64 OS (emulated) — registry wins', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: 'ARM64', registryArch: 'arm64' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'arm64', isEmulated: true })
  })
  it('x64 app on ARM64 OS — env fallback when registry unknown', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: 'ARM64', registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'arm64', isEmulated: true })
  })
  it('native arm64 app on ARM64 OS — not emulated', () => {
    const info = resolveArchInfo({ appArch: 'arm64', platform: 'win32', envArchW6432: undefined, registryArch: 'arm64' })
    expect(info).toEqual({ appArch: 'arm64', osArch: 'arm64', isEmulated: false })
  })
  it('falls back to appArch when nothing else is known', () => {
    const info = resolveArchInfo({ appArch: 'x64', platform: 'win32', envArchW6432: undefined, registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'x64', osArch: 'x64', isEmulated: false })
  })
  it('non-Windows: osArch = appArch, never emulated', () => {
    const info = resolveArchInfo({ appArch: 'arm64', platform: 'darwin', envArchW6432: undefined, registryArch: 'unknown' })
    expect(info).toEqual({ appArch: 'arm64', osArch: 'arm64', isEmulated: false })
  })
})
