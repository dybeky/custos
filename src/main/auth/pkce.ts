import { randomBytes, createHash } from 'crypto'

/** base64url (RFC 4648 §5) with padding removed. */
function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Random url-safe token of `byteLen` bytes of entropy. */
export function randomUrlSafe(byteLen: number): string {
  return toBase64Url(randomBytes(byteLen))
}

/** Opaque login-attempt state (binds the callback to this attempt). */
export function generateState(): string {
  return randomUrlSafe(32)
}

/** base64url(sha256(input)). */
export function sha256Base64Url(input: string): string {
  return toBase64Url(createHash('sha256').update(input).digest())
}

/** PKCE S256 pair: verifier (secret, stays in main) + derived challenge. */
export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomUrlSafe(32)
  return { codeVerifier, codeChallenge: sha256Base64Url(codeVerifier) }
}
