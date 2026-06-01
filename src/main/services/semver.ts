/** Parse "v3.1.0" / "3.1" into [major, minor, patch]; missing parts → 0. */
function parts(v: string): [number, number, number] {
  const clean = v.trim().replace(/^v/i, '')
  const [a, b, c] = clean.split('.').map((n) => parseInt(n, 10) || 0)
  return [a || 0, b || 0, c || 0]
}

/** -1 if a < b, 0 if equal, 1 if a > b. Leading "v" is ignored. */
export function compareSemver(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0
}
