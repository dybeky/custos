import { describe, it, expect } from 'vitest'
import { osMetaFromOsInfo, makeScanId } from './report-context'
import type { OsInfo } from '../../shared/types'

const os: OsInfo = {
  platform: 'windows', major: 11, minor: 0, build: 26100,
  name: 'Windows 11', edition: '24H2', version: '11 24H2',
  displayName: 'WINDOWS 11 24H2 · 26100 · X64',
  isWindows11: true, arch: 'x64', appArch: 'x64', isEmulated: false
}

describe('report-context', () => {
  it('projects OsInfo to the report meta subset', () => {
    expect(osMetaFromOsInfo(os)).toEqual({ name: 'Windows 11', version: '11 24H2', arch: 'x64', appArch: 'x64' })
  })

  it('builds a stable scan id from an epoch', () => {
    expect(makeScanId(1750000000000)).toBe('scan-1750000000000')
  })
})
