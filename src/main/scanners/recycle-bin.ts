/**
 * Pure parser for Windows Recycle Bin metadata ($I files).
 *
 * Every deleted item in C:\$Recycle.Bin\<SID>\ has a pair: $R<id> (the data)
 * and $I<id> (metadata: original path, size, deletion time).
 *
 *   v1 (Vista – 8.1):  u64 version=1 | u64 size | u64 FILETIME | UTF-16 path, 520 bytes
 *   v2 (Windows 10+):  u64 version=2 | u64 size | u64 FILETIME | u32 path chars | UTF-16 path
 */

export interface RecycleEntry {
  originalPath: string
  sizeBytes: number
  /** Epoch ms when the item was deleted. */
  deletedAt: number
}

/** FILETIME (100 ns since 1601-01-01 UTC) → epoch ms. */
export function filetimeToMs(ft: bigint): number {
  return Number(ft / 10_000n - 11_644_473_600_000n)
}

/** Parse one $I file; null when the buffer is not a valid v1/v2 record. */
export function parseRecycleInfo(buf: Buffer): RecycleEntry | null {
  if (buf.length < 24) return null
  const version = buf.readBigUInt64LE(0)
  const sizeBytes = Number(buf.readBigUInt64LE(8))
  const deletedAt = filetimeToMs(buf.readBigUInt64LE(16))

  let path: string
  if (version === 1n) {
    if (buf.length < 24 + 2) return null
    path = buf.subarray(24, Math.min(buf.length, 24 + 520)).toString('utf16le')
  } else if (version === 2n) {
    if (buf.length < 28) return null
    const chars = buf.readUInt32LE(24)
    const end = 28 + chars * 2
    if (chars === 0 || end > buf.length) return null
    path = buf.subarray(28, end).toString('utf16le')
  } else {
    return null
  }
  path = path.replace(/\0.*$/s, '')
  // Plausibility: a real drive path and a deletion time after 2000.
  if (!/^[A-Za-z]:\\/.test(path) || deletedAt < Date.UTC(2000, 0, 1)) return null
  return { originalPath: path, sizeBytes, deletedAt }
}
