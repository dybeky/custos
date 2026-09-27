import { createPublicKey, verify } from 'crypto'
import { z } from 'zod'

/**
 * Detection signatures published by the site (/api/desktop/signatures). They
 * only ADD to the bundled keywords/hashes — the site can extend detection
 * without a release, never switch bundled detection off.
 *
 * The bundle is Ed25519-signed by the site; the app pins the public key in
 * resources/settings.json (`signatures.publicKey`). Anything that does not verify
 * against that key — tampered in transit, served by an impostor, or edited in
 * the local cache — is discarded.
 */

// Same rules the site enforces when an entry is added; re-checked here so a
// valid signature over a bad entry still cannot flag half the disk.
const Pattern = z.string().regex(/^[a-z0-9][a-z0-9._-]{3,63}$/)
const Exact = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/)
const Domain = z.string().regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)

const PayloadSchema = z.object({
  format: z.literal(1),
  version: z.number().int().nonnegative(),
  issuedAt: z.string(),
  patterns: z.array(Pattern).max(5000),
  exactMatch: z.array(Exact).max(5000),
  domains: z.array(Domain).max(5000),
  hashes: z.array(z.object({
    sha256: Sha256,
    name: z.string().max(200),
    game: z.string().max(32).optional(),
    source: z.string().min(1).max(500)
  })).max(20000)
})

export type SignatureBundle = z.infer<typeof PayloadSchema>

export interface SignedBundle {
  payload: string
  signature: string
}

/** The verified, parsed bundle — or null when the signature or content is bad. */
export function verifyBundle(signed: SignedBundle, publicKeyB64: string): SignatureBundle | null {
  if (!publicKeyB64 || typeof signed?.payload !== 'string' || typeof signed?.signature !== 'string') return null
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ed25519') return null
    const ok = verify(null, Buffer.from(signed.payload, 'utf8'), key, Buffer.from(signed.signature, 'base64'))
    if (!ok) return null
    const parsed = PayloadSchema.safeParse(JSON.parse(signed.payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Extra matcher entries and hashes a bundle adds. */
export function bundleAdditions(b: SignatureBundle): { patterns: string[]; exactMatch: string[]; hashes: string[] } {
  return {
    // Domains match like the bundled per-game domains: as patterns.
    patterns: [...b.patterns, ...b.domains],
    exactMatch: b.exactMatch,
    hashes: b.hashes.map((h) => h.sha256)
  }
}

export function bundleEntryCount(b: SignatureBundle): number {
  return b.patterns.length + b.exactMatch.length + b.domains.length + b.hashes.length
}
