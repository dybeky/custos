/**
 * Drive letter ↔ NT device name ("C:" ↔ "\Device\HarddiskVolume3").
 *
 * Windows records executables in BAM/DAM under their NT device path. mountvol
 * and Win32_Volume only list volume GUIDs (\\?\Volume{…}\), never the
 * HarddiskVolume number, so the mapping comes from QueryDosDeviceW — the call
 * Windows itself uses for it — over koffi. Never throws: an empty map when the
 * API is unavailable.
 */

import type { LibraryHandle } from 'koffi'

type KoffiFunction = ReturnType<LibraryHandle['func']>

let queryDosDeviceW: KoffiFunction | null | undefined

function api(): KoffiFunction | null {
  if (queryDosDeviceW !== undefined) return queryDosDeviceW
  queryDosDeviceW = null
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    queryDosDeviceW = koffi.load('kernel32.dll').func('uint32 __stdcall QueryDosDeviceW(str16 name, _Out_ uint8 *target, uint32 max)')
  } catch {
    queryDosDeviceW = null
  }
  return queryDosDeviceW
}

const MAX_CHARS = 1024

/** NT device path of a drive ("C:" → "\Device\HarddiskVolume3"), or null. */
export function queryDosDevice(drive: string): string | null {
  const fn = api()
  if (!fn) return null
  try {
    const buf = Buffer.alloc(MAX_CHARS * 2)
    const len = Number(fn(drive, buf, MAX_CHARS))
    if (!len) return null
    // The result is a list of NUL-terminated strings; the first is current.
    return buf.toString('utf16le', 0, len * 2).split('\0')[0] || null
  } catch {
    return null
  }
}

/** HarddiskVolume number → drive letter ("C:"), built from `query` over A:–Z:. */
export function harddiskVolumeMap(query: (drive: string) => string | null = queryDosDevice): Map<number, string> {
  const map = new Map<number, string>()
  for (let c = 65; c <= 90; c++) {
    const drive = `${String.fromCharCode(c)}:`
    const m = /\\Device\\HarddiskVolume(\d+)$/i.exec(query(drive) ?? '')
    if (m && !map.has(Number(m[1]))) map.set(Number(m[1]), drive)
  }
  return map
}
