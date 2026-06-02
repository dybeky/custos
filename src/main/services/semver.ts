interface Parsed {
  core: [number, number, number]
  pre: string[]
}

/** Parse "v3.1.0-rc.1" / "3.1" into core [major, minor, patch] + pre-release identifiers. */
function parse(v: string): Parsed {
  const clean = v.trim().replace(/^v/i, '')
  const [main, pre = ''] = clean.split('-', 2)
  const [a, b, c] = main.split('.').map((n) => parseInt(n, 10) || 0)
  return { core: [a || 0, b || 0, c || 0], pre: pre ? pre.split('.') : [] }
}

/** Compare pre-release identifier lists per SemVer: a release outranks a pre-release. */
function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1 // release > pre-release
  if (b.length === 0) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      // Direct comparison avoids precision loss from subtracting very large ints.
      const xv = parseInt(x, 10)
      const yv = parseInt(y, 10)
      if (xv > yv) return 1
      if (xv < yv) return -1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** -1 if a < b, 0 if equal, 1 if a > b. Leading "v" ignored; SemVer pre-release aware. */
export function compareSemver(a: string, b: string): number {
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] > pb.core[i]) return 1
    if (pa.core[i] < pb.core[i]) return -1
  }
  return comparePre(pa.pre, pb.pre)
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0
}
