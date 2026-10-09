/**
 * Apply a SQLite write-ahead log to a copy of its database.
 *
 * While a browser runs, its newest history sits in `<db>-wal`, not in the
 * database file: Firefox's places.sqlite in particular can hold days of
 * visits there. sql.js reads a single in-memory image and ignores the WAL,
 * so the committed frames are replayed here first.
 *
 * Only frames that belong to the current WAL generation (matching salts),
 * have valid cumulative checksums and end in a commit are applied — exactly
 * what SQLite itself would read. Anything else returns the database unchanged.
 */

const WAL_HEADER = 32
const FRAME_HEADER = 24

function checksum(buf: Buffer, start: number, end: number, bigEndian: boolean, s: [number, number]): [number, number] {
  let [s0, s1] = s
  for (let i = start; i < end; i += 8) {
    const x0 = bigEndian ? buf.readUInt32BE(i) : buf.readUInt32LE(i)
    const x1 = bigEndian ? buf.readUInt32BE(i + 4) : buf.readUInt32LE(i + 4)
    s0 = (s0 + x0 + s1) >>> 0
    s1 = (s1 + x1 + s0) >>> 0
  }
  return [s0, s1]
}

export function applyWal(db: Buffer, wal: Buffer | null): Buffer {
  if (!wal || wal.length < WAL_HEADER) return db
  const magic = wal.readUInt32BE(0)
  if (magic !== 0x377f0682 && magic !== 0x377f0683) return db
  const bigEndian = magic === 0x377f0683
  const pageSize = wal.readUInt32BE(8) === 1 ? 65536 : wal.readUInt32BE(8)
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) return db
  const salt1 = wal.readUInt32BE(16)
  const salt2 = wal.readUInt32BE(20)
  let sum = checksum(wal, 0, 24, bigEndian, [0, 0])
  if (sum[0] !== wal.readUInt32BE(24) || sum[1] !== wal.readUInt32BE(28)) return db

  const pending = new Map<number, number>() // page number → frame offset, uncommitted
  const committed = new Map<number, number>()
  let dbPages = 0
  for (let off = WAL_HEADER; off + FRAME_HEADER + pageSize <= wal.length; off += FRAME_HEADER + pageSize) {
    if (wal.readUInt32BE(off + 8) !== salt1 || wal.readUInt32BE(off + 12) !== salt2) break
    sum = checksum(wal, off, off + 8, bigEndian, sum)
    sum = checksum(wal, off + FRAME_HEADER, off + FRAME_HEADER + pageSize, bigEndian, sum)
    if (sum[0] !== wal.readUInt32BE(off + 16) || sum[1] !== wal.readUInt32BE(off + 20)) break
    const page = wal.readUInt32BE(off)
    if (page === 0) break
    pending.set(page, off + FRAME_HEADER)
    const commitSize = wal.readUInt32BE(off + 4)
    if (commitSize > 0) {
      for (const [p, o] of pending) committed.set(p, o)
      pending.clear()
      dbPages = commitSize
    }
  }
  if (committed.size === 0) return db

  const out = Buffer.alloc(dbPages * pageSize)
  db.copy(out, 0, 0, Math.min(db.length, out.length))
  for (const [page, frameOff] of committed) {
    if (page <= dbPages) wal.copy(out, (page - 1) * pageSize, frameOff, frameOff + pageSize)
  }
  // The image no longer needs its WAL: mark it as a rollback-journal database.
  if (out.length >= 20) {
    out[18] = 1
    out[19] = 1
  }
  return out
}
