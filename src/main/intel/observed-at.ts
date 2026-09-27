/**
 * Recover WHEN a finding's activity happened from the finding text.
 *
 * Scanners that know a time embed it in their output in one of two forms:
 *  - `DD/MM/YYYY, HH:MM` — formatTimestamp (en-GB, the scanned PC's local
 *    time): Prefetch "last run", BAM execution time, browser visit time;
 *  - `YYYY-MM-DD HH:MM UTC` — the anti-forensics scanner.
 *
 * Analysis runs in the main process on the scanned machine itself, so a local
 * timestamp is interpreted in this process's timezone, which is the right one.
 */
const LOCAL_TS = /\b(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})\b/
const UTC_TS = /\b(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC\b/

/** ISO timestamp of the activity a finding describes, or null if it has none. */
export function extractObservedAt(value: string): string | null {
  const utc = UTC_TS.exec(value)
  if (utc) {
    const [, y, mo, d, h, mi] = utc.map(Number)
    return valid(new Date(Date.UTC(y, mo - 1, d, h, mi)))
  }
  const local = LOCAL_TS.exec(value)
  if (local) {
    const [, d, mo, y, h, mi] = local.map(Number)
    return valid(new Date(y, mo - 1, d, h, mi))
  }
  return null
}

function valid(date: Date): string | null {
  // Reject impossible dates (31/02) that Date silently rolls over, and years
  // outside any plausible artifact range.
  const t = date.getTime()
  if (Number.isNaN(t)) return null
  const y = date.getUTCFullYear()
  if (y < 2000 || y > 2100) return null
  return date.toISOString()
}
