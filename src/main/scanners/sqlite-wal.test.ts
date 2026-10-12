import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import initSqlJs from 'sql.js'
import { applyWal } from './sqlite-wal'

// A real SQLite 3.45 WAL pair: the database file holds one row, the -wal holds
// three committed rows that were never checkpointed (a browser that is open).
const DIR = join(__dirname, '__fixtures__')
const db = readFileSync(join(DIR, 'wal-places.sqlite'))
const wal = readFileSync(join(DIR, 'wal-places.sqlite-wal'))

async function urls(image: Buffer): Promise<string[]> {
  const SQL = await initSqlJs()
  const d = new SQL.Database(image)
  try {
    return (d.exec('SELECT url FROM moz_places ORDER BY id')[0]?.values ?? []).map((r) => String(r[0]))
  } finally {
    d.close()
  }
}

describe('applyWal', () => {
  it('without the WAL, recent history is missing', async () => {
    expect(await urls(db)).toEqual(['https://old.example/'])
  })

  it('replays committed WAL frames so recent history is read', async () => {
    expect(await urls(applyWal(db, wal))).toEqual([
      'https://old.example/',
      'https://undead.example/0',
      'https://undead.example/1',
      'https://undead.example/2'
    ])
  })

  it('ignores a WAL whose frames fail their checksum', async () => {
    const broken = Buffer.from(wal)
    broken[wal.length - 10] ^= 0xff // flip a byte in the last frame's page
    expect(await urls(applyWal(db, broken))).toEqual(['https://old.example/'])
  })

  it('refuses a valid-looking WAL that claims a database far larger than it carries', () => {
    // One well-formed frame (page 1) whose commit record says the database
    // is 4 million pages — an allocation of gigabytes if it were believed.
    const pageSize = 4096
    const out = Buffer.alloc(32 + 24 + pageSize)
    const sum = (start: number, end: number, s: [number, number]): [number, number] => {
      let [s0, s1] = s
      for (let i = start; i < end; i += 8) {
        s0 = (s0 + out.readUInt32LE(i) + s1) >>> 0
        s1 = (s1 + out.readUInt32LE(i + 4) + s0) >>> 0
      }
      return [s0, s1]
    }
    out.writeUInt32BE(0x377f0682, 0)
    out.writeUInt32BE(3007000, 4)
    out.writeUInt32BE(pageSize, 8)
    out.writeUInt32BE(7, 16)
    out.writeUInt32BE(9, 20)
    let s = sum(0, 24, [0, 0])
    out.writeUInt32BE(s[0], 24)
    out.writeUInt32BE(s[1], 28)
    out.writeUInt32BE(1, 32) // page 1
    out.writeUInt32BE(4_000_000, 36) // commit: "the database is now 4M pages"
    out.writeUInt32BE(7, 40)
    out.writeUInt32BE(9, 44)
    s = sum(32, 40, s)
    s = sum(56, 56 + pageSize, s)
    out.writeUInt32BE(s[0], 48)
    out.writeUInt32BE(s[1], 52)
    expect(applyWal(db, out)).toBe(db)
  })

  it('leaves the database alone for a missing, short or foreign WAL', () => {
    expect(applyWal(db, null)).toBe(db)
    expect(applyWal(db, Buffer.alloc(10))).toBe(db)
    expect(applyWal(db, Buffer.alloc(64, 1))).toBe(db)
  })
})
