import { z } from 'zod'
import { logger } from './logger'

const ApiAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z.string(),
  size: z.number(),
  /** "sha256:<hex>" — GitHub computes it on upload; absent on very old assets. */
  digest: z.string().nullish()
})
const ApiReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  html_url: z.string(),
  published_at: z.string(),
  assets: z.array(ApiAssetSchema).default([])
})

export const REPO = 'dybeky/custos'
const BASE = `https://api.github.com/repos/${REPO}`
const HEADERS = { 'User-Agent': 'custos-app', Accept: 'application/vnd.github+json' }
const TIMEOUT_MS = 8000

export interface GithubAsset {
  name: string
  url: string
  size: number
  /** Lowercase SHA-256 hex, or null when GitHub has none for the asset. */
  sha256: string | null
}

export interface GithubRelease {
  tagName: string
  body: string
  htmlUrl: string
  publishedAt: string
  assets?: GithubAsset[]
}

// Per-session caches so launch-time "What's new" + update checks cost at most
// a couple of calls (the unauthenticated API allows 60 an hour).
let _releaseCache: GithubRelease | null | undefined
const _versionCache = new Map<string, GithubRelease | null>()

export async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal })
    if (!res.ok) return { ok: false, status: res.status, data: null }
    return { ok: true, status: res.status, data: (await res.json()) as T }
  } catch (err) {
    logger.debug('github fetch failed', { url, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, status: 0, data: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Validate an API release object; null when it doesn't match. */
function parseRelease(data: unknown): GithubRelease | null {
  const parsed = ApiReleaseSchema.safeParse(data)
  if (!parsed.success) {
    logger.debug('release response failed validation', { error: parsed.error.message })
    return null
  }
  return {
    tagName: parsed.data.tag_name,
    body: (parsed.data.body ?? '').slice(0, 10000),
    htmlUrl: parsed.data.html_url,
    publishedAt: parsed.data.published_at,
    assets: parsed.data.assets.map((a) => {
      const m = /^sha256:([0-9a-f]{64})$/i.exec(a.digest ?? '')
      return { name: a.name, url: a.browser_download_url, size: a.size, sha256: m ? m[1].toLowerCase() : null }
    })
  }
}

export interface ReleaseResult { status: 'ok' | 'error'; release: GithubRelease | null }

export async function getLatestReleaseResult(): Promise<ReleaseResult> {
  if (_releaseCache !== undefined && _releaseCache !== null) return { status: 'ok', release: _releaseCache }
  const { ok, status, data } = await getJson<unknown>(`${BASE}/releases/latest`)
  if (!ok) {
    logger.debug('release check failed', { status })
    return { status: 'error', release: null }
  }
  const release = parseRelease(data)
  if (!release) return { status: 'error', release: null }
  _releaseCache = release
  return { status: 'ok', release }
}

/**
 * The release this build was published as (tag "3.0.1" or "v3.0.1"), for the
 * dashboard's "What's new". Null for a build that was never released.
 */
export async function getReleaseForVersion(version: string): Promise<GithubRelease | null> {
  if (_versionCache.has(version)) return _versionCache.get(version) ?? null
  let release: GithubRelease | null = null
  for (const tag of [version, `v${version}`]) {
    const { ok, status, data } = await getJson<unknown>(`${BASE}/releases/tags/${encodeURIComponent(tag)}`)
    if (ok) {
      release = parseRelease(data)
      break
    }
    // Anything but "no such tag" (offline, rate limit) — don't cache, retry next launch.
    if (status !== 404) return null
  }
  _versionCache.set(version, release)
  return release
}

/** Test-only cache reset. */
export function _resetGithubCache(): void {
  _releaseCache = undefined
  _versionCache.clear()
}
