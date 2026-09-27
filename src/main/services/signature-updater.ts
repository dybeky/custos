import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { SignatureStatus } from '../../shared/types'
import { bundleEntryCount, verifyBundle, type SignatureBundle, type SignedBundle } from './signature-bundle'

const REQUEST_TIMEOUT_MS = 15_000

export interface SignatureUpdaterDeps {
  /** Site origin, e.g. https://97437.dev. */
  baseUrl: string
  /** Pinned Ed25519 public key (base64 SPKI). Empty = updates off. */
  publicKey: string
  /** Where the last verified bundle is cached between launches. */
  cacheFile: string
  appVersion: string
  /** Called with every newly accepted bundle. */
  onApply: (bundle: SignatureBundle) => void
  fetchImpl?: typeof fetch
  now?: () => Date
}

/**
 * Keeps the site's signed signature bundle current. A bundle is accepted only
 * when it verifies against the pinned key AND is newer than the one in use
 * (rollback protection: a replayed older bundle cannot remove entries). The
 * cache is re-verified on load, so editing it by hand only disables it.
 */
export class SignatureUpdater {
  private current: SignatureBundle | null = null
  private lastCheckedAt: string | undefined
  private lastError: string | undefined
  private inFlight: Promise<SignatureStatus> | null = null

  constructor(private deps: SignatureUpdaterDeps) {}

  get enabled(): boolean {
    return !!this.deps.publicKey
  }

  status(): SignatureStatus {
    return {
      enabled: this.enabled,
      version: this.current?.version ?? 0,
      entries: this.current ? bundleEntryCount(this.current) : 0,
      lastCheckedAt: this.lastCheckedAt,
      lastError: this.lastError
    }
  }

  /** Apply the cached bundle, if it still verifies. */
  async loadCached(): Promise<void> {
    if (!this.enabled) return
    try {
      const signed = JSON.parse(await readFile(this.deps.cacheFile, 'utf8')) as SignedBundle
      this.accept(signed)
    } catch {
      // no cache yet, or unreadable — the next check fetches a fresh one
    }
  }

  private accept(signed: SignedBundle): boolean {
    const bundle = verifyBundle(signed, this.deps.publicKey)
    if (!bundle) return false
    if (this.current && bundle.version <= this.current.version) return false
    this.current = bundle
    this.deps.onApply(bundle)
    return true
  }

  /** Fetch a newer bundle from the site (concurrent calls share one request). */
  check(): Promise<SignatureStatus> {
    this.inFlight ??= this.doCheck().finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private async doCheck(): Promise<SignatureStatus> {
    if (!this.enabled) return this.status()
    const fetchImpl = this.deps.fetchImpl ?? fetch
    const url = new URL('/api/desktop/signatures', this.deps.baseUrl)
    if (this.current) url.searchParams.set('since', String(this.current.version))
    try {
      const res = await fetchImpl(url.toString(), {
        headers: { 'X-Custos-Version': this.deps.appVersion },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      this.lastCheckedAt = (this.deps.now?.() ?? new Date()).toISOString()
      if (res.status === 204) {
        this.lastError = undefined
        return this.status()
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        // "signing_disabled" = the site publishes nothing yet: not an error.
        this.lastError = body.error === 'signing_disabled' ? undefined : (body.error ?? `http_${res.status}`)
        return this.status()
      }
      const body = (await res.json()) as SignedBundle
      const signed = { payload: body.payload, signature: body.signature }
      if (!verifyBundle(signed, this.deps.publicKey)) {
        this.lastError = 'bad_signature'
        return this.status()
      }
      this.lastError = undefined
      if (this.accept(signed)) await this.writeCache(signed)
    } catch (e) {
      this.lastError = e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'network'
    }
    return this.status()
  }

  private async writeCache(signed: SignedBundle): Promise<void> {
    try {
      await mkdir(dirname(this.deps.cacheFile), { recursive: true })
      const tmp = `${this.deps.cacheFile}.tmp`
      await writeFile(tmp, JSON.stringify(signed), 'utf8')
      await rename(tmp, this.deps.cacheFile)
    } catch {
      // cache is an optimization; the bundle is applied for this run regardless
    }
  }
}
