import { describe, it, expect, vi } from 'vitest'

// Mock the scanner factory so getScannerCapabilities doesn't try to
// instantiate real scanners during tests.
vi.mock('../scanners', () => ({
  getScannerFactory: () => ({
    getScannerInfo: () => []
  })
}))

// Mock getOsInfo so we can control the OS in higher-level tests without
// affecting the pure resolveCapability tests.
vi.mock('../utils/os-utils', () => ({
  getOsInfo: vi.fn()
}))

import { resolveCapability, Requirement } from './capability-service'
import { OsInfo } from '../../shared/types'

// ─── Helper OS objects ────────────────────────────────────────────────────────

function makeWindowsOs(build: number): OsInfo {
  return {
    platform: 'windows',
    major: 10,
    minor: 0,
    build,
    name: `Windows ${build >= 22000 ? '11' : '10'}`,
    edition: '',
    version: build.toString(),
    displayName: `WINDOWS · ${build}`,
    isWindows11: build >= 22000,
    arch: 'x64',
    appArch: 'x64',
    isEmulated: false
  }
}

function makeMacOs(): OsInfo {
  return {
    platform: 'macos',
    major: 15,
    minor: 0,
    build: 0,
    name: 'macOS',
    edition: 'Sequoia',
    version: '15.0',
    displayName: 'MACOS SEQUOIA · 15.0',
    isWindows11: false,
    arch: 'x64',
    appArch: 'x64',
    isEmulated: false
  }
}

function makeLinuxOs(): OsInfo {
  return {
    platform: 'linux',
    major: 6,
    minor: 1,
    build: 0,
    name: 'Linux',
    edition: '',
    version: '6.1.0',
    displayName: 'LINUX 6.1.0',
    isWindows11: false,
    arch: 'x64',
    appArch: 'x64',
    isEmulated: false
  }
}

const BASE_FEATURE = {
  id: 'test-feature',
  name: 'Test Feature',
  description: 'A test feature',
  category: 'scan' as const
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveCapability — platform gating', () => {
  const windowsOnlyReq: Requirement = { platforms: ['windows'], requirement: 'Windows' }
  const anyOsReq: Requirement = { platforms: ['windows', 'macos', 'linux', 'unknown'], requirement: 'Any system' }

  it('marks a Windows-only scanner as supported on Windows', () => {
    const cap = resolveCapability(BASE_FEATURE, windowsOnlyReq, makeWindowsOs(19041))
    expect(cap.supported).toBe(true)
    expect(cap.reason).toBeUndefined()
  })

  it('marks a Windows-only scanner as unsupported on macOS', () => {
    const cap = resolveCapability(BASE_FEATURE, windowsOnlyReq, makeMacOs())
    expect(cap.supported).toBe(false)
    expect(cap.reason).toContain('macOS')
    expect(cap.reason).toContain('Windows')
  })

  it('marks a Windows-only scanner as unsupported on Linux', () => {
    const cap = resolveCapability(BASE_FEATURE, windowsOnlyReq, makeLinuxOs())
    expect(cap.supported).toBe(false)
    expect(cap.reason).toContain('Linux')
  })

  it('marks an any-OS feature as supported on Windows', () => {
    const cap = resolveCapability(BASE_FEATURE, anyOsReq, makeWindowsOs(22000))
    expect(cap.supported).toBe(true)
  })

  it('marks an any-OS feature as supported on macOS', () => {
    const cap = resolveCapability(BASE_FEATURE, anyOsReq, makeMacOs())
    expect(cap.supported).toBe(true)
  })

  it('marks an any-OS feature as supported on Linux', () => {
    const cap = resolveCapability(BASE_FEATURE, anyOsReq, makeLinuxOs())
    expect(cap.supported).toBe(true)
  })
})

describe('resolveCapability — minWindowsBuild gating (BAM scanner)', () => {
  // BAM requires Windows 10 build 16299 (Fall Creators Update)
  const bamReq: Requirement = {
    platforms: ['windows'],
    minWindowsBuild: 16299,
    requirement: 'Windows 10 1709+'
  }

  it('marks BAM as supported on build 16299 (exact minimum)', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeWindowsOs(16299))
    expect(cap.supported).toBe(true)
  })

  it('marks BAM as supported on a modern Windows 10 build', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeWindowsOs(19041))
    expect(cap.supported).toBe(true)
  })

  it('marks BAM as supported on Windows 11 (build 22000)', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeWindowsOs(22000))
    expect(cap.supported).toBe(true)
  })

  it('marks BAM as unsupported on a build below 16299', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeWindowsOs(15063))
    expect(cap.supported).toBe(false)
    expect(cap.reason).toContain('16299')
  })

  it('marks BAM as unsupported on the build just below minimum (16298)', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeWindowsOs(16298))
    expect(cap.supported).toBe(false)
    expect(cap.reason).toBeTruthy()
  })

  it('marks BAM as unsupported on macOS regardless of minWindowsBuild', () => {
    const cap = resolveCapability(BASE_FEATURE, bamReq, makeMacOs())
    expect(cap.supported).toBe(false)
    // Platform gate fires first — no build-number message expected
    expect(cap.reason).toContain('macOS')
  })
})

describe('resolveCapability — returned capability shape', () => {
  const req: Requirement = { platforms: ['windows'], requirement: 'Windows' }

  it('preserves all base fields in the returned capability', () => {
    const cap = resolveCapability(BASE_FEATURE, req, makeWindowsOs(19041))
    expect(cap.id).toBe(BASE_FEATURE.id)
    expect(cap.name).toBe(BASE_FEATURE.name)
    expect(cap.description).toBe(BASE_FEATURE.description)
    expect(cap.category).toBe(BASE_FEATURE.category)
    expect(cap.requirement).toBe(req.requirement)
  })

  it('does not include reason when supported', () => {
    const cap = resolveCapability(BASE_FEATURE, req, makeWindowsOs(19041))
    expect(cap.reason).toBeUndefined()
  })

  it('includes reason when not supported', () => {
    const cap = resolveCapability(BASE_FEATURE, req, makeMacOs())
    expect(typeof cap.reason).toBe('string')
    expect(cap.reason!.length).toBeGreaterThan(0)
  })
})
