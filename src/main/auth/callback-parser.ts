/**
 * Strictly parse a custos:// deep link. Accepts ONLY
 * custos://auth/callback?state=<nonempty>&code=<nonempty>. Everything else
 * (scheme/host/path/missing/garbage) returns null and must be rejected.
 *
 * Security-critical (spec §4.6): the deep-link handler must accept ONLY the
 * exact expected callback shape before any token exchange happens.
 *
 * Note on host/path decomposition: the custos:// scheme has an authority
 * component, so `new URL('custos://auth/callback')` parses `auth` as the host
 * and `/callback` as the pathname. This is why `custos://callback` (host
 * `callback`, empty path) and `custos://auth` (host `auth`, empty path) are
 * both correctly rejected.
 */
export function parseCallback(url: string): { state: string; code: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'custos:') return null
  if (u.host !== 'auth') return null
  if (u.pathname !== '/callback') return null
  const state = u.searchParams.get('state')
  const code = u.searchParams.get('code')
  if (!state || !code) return null
  return { state, code }
}

/** Find a custos:// callback in a Windows second-instance argv array. */
export function findCallbackInArgv(argv: string[]): string | null {
  return argv.find((a) => a.startsWith('custos://')) ?? null
}
