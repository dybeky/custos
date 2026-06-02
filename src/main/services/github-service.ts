import { z } from 'zod'
import { logger } from './logger'
import type { RawCommit } from './changelog'

const ApiReleaseSchema = z.object({
  tag_name: z.string(),
  body: z.string().nullish(),
  html_url: z.string(),
  published_at: z.string()
})
const ApiCommitSchema = z.object({
  sha: z.string(),
  commit: z.object({ message: z.string(), author: z.object({ date: z.string() }) })
})

export const REPO = 'dybeky/custos'
const BASE = `https://api.github.com/repos/${REPO}`
const HEADERS = { 'User-Agent': 'custos-app', Accept: 'application/vnd.github+json' }
const TIMEOUT_MS = 8000

export interface GithubRelease {
  tagName: string
  body: string
  htmlUrl: string
  publishedAt: string
}

// Per-session cache so launch-time changelog + update checks cost at most 2 calls.
let _commitsCache: RawCommit[] | undefined
let _releaseCache: GithubRelease | null | undefined

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

export async function getRecentCommits(perPage = 30): Promise<RawCommit[]> {
  if (_commitsCache) return _commitsCache
  const { ok, data } = await getJson<unknown>(`${BASE}/commits?sha=main&per_page=${perPage}`)
  if (!ok) return []
  const parsed = z.array(ApiCommitSchema).safeParse(data)
  if (!parsed.success) {
    logger.debug('commits response failed validation', { error: parsed.error.message })
    return []
  }
  _commitsCache = parsed.data.map((c) => ({ sha: c.sha, message: c.commit.message, date: c.commit.author.date }))
  return _commitsCache
}

export async function getLatestRelease(): Promise<GithubRelease | null> {
  if (_releaseCache !== undefined) return _releaseCache
  const { ok, data } = await getJson<unknown>(`${BASE}/releases/latest`)
  const parsed = ok ? ApiReleaseSchema.safeParse(data) : null
  if (!parsed || !parsed.success) {
    if (ok) logger.debug('release response failed validation', { error: parsed?.error.message })
    _releaseCache = null
    return _releaseCache
  }
  _releaseCache = {
    tagName: parsed.data.tag_name,
    body: (parsed.data.body ?? '').slice(0, 10000),
    htmlUrl: parsed.data.html_url,
    publishedAt: parsed.data.published_at
  }
  return _releaseCache
}

export interface ReleaseResult { status: 'ok' | 'error'; release: GithubRelease | null }

export async function getLatestReleaseResult(): Promise<ReleaseResult> {
  if (_releaseCache !== undefined && _releaseCache !== null) return { status: 'ok', release: _releaseCache }
  const { ok, status, data } = await getJson<unknown>(`${BASE}/releases/latest`)
  if (!ok) {
    logger.debug('release check failed', { status })
    return { status: 'error', release: null }
  }
  const parsed = ApiReleaseSchema.safeParse(data)
  if (!parsed.success) {
    logger.debug('release response failed validation', { error: parsed.error.message })
    return { status: 'error', release: null }
  }
  const release: GithubRelease = {
    tagName: parsed.data.tag_name,
    body: (parsed.data.body ?? '').slice(0, 10000),
    htmlUrl: parsed.data.html_url,
    publishedAt: parsed.data.published_at
  }
  _releaseCache = release
  return { status: 'ok', release }
}

/** Test-only cache reset. */
export function _resetGithubCache(): void {
  _commitsCache = undefined
  _releaseCache = undefined
}
