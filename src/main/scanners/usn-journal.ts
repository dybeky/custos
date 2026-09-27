/**
 * Pure parsing for the NTFS change journal (USN), read via
 * `fsutil usn readjournal <drive> csv`.
 *
 * The journal records every create / rename / delete on the volume, so a
 * cheat that was downloaded, renamed to something innocent and deleted still
 * leaves its whole story here. Records are grouped by NTFS file id so a
 * rename chain (aimbot.dll → update.dll) reads as one file.
 */

export const USN_REASON = {
  DATA_OVERWRITE: 0x1,
  DATA_EXTEND: 0x2,
  FILE_CREATE: 0x100,
  FILE_DELETE: 0x200,
  RENAME_OLD_NAME: 0x1000,
  RENAME_NEW_NAME: 0x2000
} as const

export type DateOrder = 'MDY' | 'DMY' | 'YMD'

/** Windows sShortDate (e.g. "M/d/yyyy", "dd.MM.yyyy", "yyyy-MM-dd") → field order. */
export function dateOrderFromPattern(pattern: string | null | undefined): DateOrder {
  const p = (pattern ?? '').toLowerCase()
  const y = p.indexOf('y'), m = p.indexOf('m'), d = p.indexOf('d')
  if (y === -1 || m === -1 || d === -1) return 'MDY'
  if (y < m && y < d) return 'YMD'
  return d < m ? 'DMY' : 'MDY'
}

/**
 * Parse a fsutil timestamp in the system's short-date order, with a 24h or
 * AM/PM time (local clock). Null when it cannot be read unambiguously.
 */
export function parseUsnTimestamp(s: string, order: DateOrder): number | null {
  const m = /(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/.exec(s.trim())
  if (!m) return null
  const a = Number(m[1]), b = Number(m[2]), c = Number(m[3])
  let y: number, mo: number, d: number
  if (order === 'YMD' || m[1].length === 4) [y, mo, d] = [a, b, c]
  else if (order === 'DMY') [d, mo, y] = [a, b, c]
  else [mo, d, y] = [a, b, c]
  let h = Number(m[4])
  const ap = m[7]?.toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const t = new Date(y, mo - 1, d, h, Number(m[5]), Number(m[6] ?? 0)).getTime()
  return Number.isNaN(t) ? null : t
}

/** Split one CSV line, honouring double-quoted fields. */
export function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((f) => f.trim())
}

export interface UsnColumns { name: number; reason: number; time: number; fileId: number }

/**
 * Column positions from the CSV header. The header is localized on non-English
 * Windows, but the column ORDER is fixed, so fall back to the documented one.
 */
export function usnColumns(header: string): UsnColumns {
  const cols = splitCsv(header).map((c) => c.toLowerCase())
  const idx = (name: string, fallback: number) => {
    const i = cols.indexOf(name)
    return i === -1 ? fallback : i
  }
  return { name: idx('file name', 1), reason: idx('reason', 3), time: idx('time stamp', 4), fileId: idx('file id', 6) }
}

export interface UsnRecord { name: string; reason: number; at: number | null; fileId: string }

export function parseUsnRecord(line: string, cols: UsnColumns, order: DateOrder): UsnRecord | null {
  const f = splitCsv(line)
  const name = f[cols.name]
  const reasonHex = /0x[0-9a-f]+/i.exec(f[cols.reason] ?? '')
  if (!name || !reasonHex) return null
  return {
    name,
    reason: parseInt(reasonHex[0], 16),
    at: parseUsnTimestamp(f[cols.time] ?? '', order),
    fileId: (f[cols.fileId] ?? '').toLowerCase() || `name:${name.toLowerCase()}`
  }
}

interface FileStory { names: string[]; created: boolean; deleted: boolean; renamed: boolean; modified: boolean; last: number | null; hit: boolean }

/**
 * Streams USN records and keeps, per file id, the story of any file that at
 * some point carried a cheat-like name.
 */
export class UsnAggregator {
  private stories = new Map<string, FileStory>()
  constructor(private matches: (name: string) => boolean, private maxFiles = 200) {}

  add(r: UsnRecord): void {
    let s = this.stories.get(r.fileId)
    const hit = this.matches(r.name)
    if (!s) {
      // Only start tracking a file once it matters, to bound memory.
      if (!hit || this.stories.size >= this.maxFiles * 5) return
      s = { names: [], created: false, deleted: false, renamed: false, modified: false, last: null, hit: false }
      this.stories.set(r.fileId, s)
    }
    s.hit ||= hit
    if (s.names[s.names.length - 1] !== r.name) s.names.push(r.name)
    if (r.reason & USN_REASON.FILE_CREATE) s.created = true
    if (r.reason & USN_REASON.FILE_DELETE) s.deleted = true
    if (r.reason & (USN_REASON.RENAME_NEW_NAME | USN_REASON.RENAME_OLD_NAME)) s.renamed = true
    if (r.reason & (USN_REASON.DATA_OVERWRITE | USN_REASON.DATA_EXTEND)) s.modified = true
    if (r.at !== null && (s.last === null || r.at > s.last)) s.last = r.at
  }

  /** Findings, most recent first. `formatTime` renders the last-activity time. */
  findings(drive: string, formatTime: (ms: number) => string): string[] {
    return [...this.stories.values()]
      .filter((s) => s.hit)
      .sort((a, b) => (b.last ?? 0) - (a.last ?? 0))
      .slice(0, this.maxFiles)
      .map((s) => {
        const actions = [s.created && 'created', s.modified && 'written', s.renamed && 'renamed', s.deleted && 'deleted'].filter(Boolean)
        return `[USN ${drive}] ${s.names.join(' → ')}` +
          (actions.length ? ` — ${actions.join(', ')}` : '') +
          (s.last !== null ? ` | ${formatTime(s.last)}` : '')
      })
  }
}
