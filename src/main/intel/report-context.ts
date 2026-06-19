import type { OsInfo } from '../../shared/types'

export function osMetaFromOsInfo(os: OsInfo): { name: string; version: string; arch: string; appArch: string } {
  return { name: os.name, version: os.version, arch: os.arch, appArch: os.appArch }
}

export function makeScanId(epochMs: number): string {
  return `scan-${epochMs}`
}
