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

  it('leaves the database alone for a missing, short or foreign WAL', () => {
    expect(applyWal(db, null)).toBe(db)
    expect(applyWal(db, Buffer.alloc(10))).toBe(db)
    expect(applyWal(db, Buffer.alloc(64, 1))).toBe(db)
  })
})
