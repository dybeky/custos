import { describe, it, expect } from 'vitest'
import { UsnAggregator, dateOrderFromPattern, parseUsnRecord, parseUsnTimestamp, splitCsv, usnColumns } from './usn-journal'

const HEADER = 'Usn,File name,File name length,Reason,Time stamp,File attributes,File ID,Parent file ID,Source info,Security ID,Major version,Minor version,Record length'
const row = (name: string, reason: string, time: string, id: string) =>
  `0x0000000012340000,"${name}",${name.length * 2},${reason},${time},0x00000020,${id},0000000000000000000500000000000a,0x00000000,0,3,0,96`

describe('USN journal parsing', () => {
  it('derives date order from sShortDate', () => {
    expect(dateOrderFromPattern('M/d/yyyy')).toBe('MDY')
    expect(dateOrderFromPattern('dd.MM.yyyy')).toBe('DMY')
    expect(dateOrderFromPattern('dd/MM/yyyy')).toBe('DMY')
    expect(dateOrderFromPattern('yyyy-MM-dd')).toBe('YMD')
    expect(dateOrderFromPattern(undefined)).toBe('MDY')
  })

  it('parses timestamps in the system order, 12h and 24h', () => {
    expect(parseUsnTimestamp('9/27/2026 1:30:11 PM', 'MDY')).toBe(new Date(2026, 8, 27, 13, 30, 11).getTime())
    expect(parseUsnTimestamp('27.09.2026 13:30:11', 'DMY')).toBe(new Date(2026, 8, 27, 13, 30, 11).getTime())
    expect(parseUsnTimestamp('2026-09-27 00:05:00', 'MDY')).toBe(new Date(2026, 8, 27, 0, 5, 0).getTime())
    expect(parseUsnTimestamp('12/27/2026 12:00:00 AM', 'MDY')).toBe(new Date(2026, 11, 27, 0, 0, 0).getTime())
    expect(parseUsnTimestamp('garbage', 'MDY')).toBeNull()
    expect(parseUsnTimestamp('13/13/2026 10:00:00', 'MDY')).toBeNull()
  })

  it('splits quoted CSV fields', () => {
    expect(splitCsv('a,"b, c","d ""q"""')).toEqual(['a', 'b, c', 'd "q"'])
  })

  it('finds columns from the header, falling back to the documented order', () => {
    expect(usnColumns(HEADER)).toEqual({ name: 1, reason: 3, time: 4, fileId: 6 })
    expect(usnColumns('Usn,Имя файла,Длина,Причина,Отметка времени,Атрибуты,ИД файла')).toEqual({ name: 1, reason: 3, time: 4, fileId: 6 })
  })

  it('tells the full story of a renamed-then-deleted cheat, grouped by file id', () => {
    const cols = usnColumns(HEADER)
    const agg = new UsnAggregator((n) => /aimbot|undead/i.test(n))
    const lines = [
      row('aimbot.dll', '0x00000100', '9/27/2026 12:00:00 PM', 'ID1'),
      row('aimbot.dll', '0x00000002', '9/27/2026 12:00:05 PM', 'ID1'),
      row('aimbot.dll', '0x00001000', '9/27/2026 12:10:00 PM', 'ID1'),
      row('update.dll', '0x00002000', '9/27/2026 12:10:00 PM', 'ID1'),
      row('update.dll', '0x80000200', '9/27/2026 12:40:00 PM', 'ID1'),
      row('notes.txt', '0x00000100', '9/27/2026 12:00:00 PM', 'ID2')
    ]
    for (const l of lines) agg.add(parseUsnRecord(l, cols, 'MDY')!)
    expect(agg.findings('C:', (ms) => new Date(ms).toISOString())).toEqual([
      `[USN C:] aimbot.dll → update.dll — created, written, renamed, deleted | ${new Date(2026, 8, 27, 12, 40).toISOString()}`
    ])
  })

  it('catches a file renamed TO a cheat name', () => {
    const cols = usnColumns(HEADER)
    const agg = new UsnAggregator((n) => /undead/i.test(n))
    agg.add(parseUsnRecord(row('setup.exe', '0x00000100', '9/27/2026 12:00:00 PM', 'ID9'), cols, 'MDY')!)
    agg.add(parseUsnRecord(row('undead.exe', '0x00002000', '9/27/2026 12:01:00 PM', 'ID9'), cols, 'MDY')!)
    // setup.exe was not tracked before the rename; the story starts at the matching name.
    expect(agg.findings('C:', () => 't')).toEqual(['[USN C:] undead.exe — renamed | t'])
  })

  it('ignores malformed lines', () => {
    expect(parseUsnRecord('not,a,record', usnColumns(HEADER), 'MDY')).toBeNull()
  })
})
