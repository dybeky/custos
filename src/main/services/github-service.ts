import { logger } from './logger'
import type { RawCommit } from './changelog'

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

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; data: T | null }> {
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

interface ApiCommit { sha: string; commit: { message: string; author: { date: string } } }

export async function getRecentCommits(perPage = 30): Promise<RawCommit[]> {
  if (_commitsCache) return _commitsCache
  const { ok, data } = await getJson<ApiCommit[]>(`${BASE}/commits?sha=main&per_page=${perPage}`)
  if (!ok || !Array.isArray(data)) return []
  _commitsCache = data.map((c) => ({ sha: c.sha, message: c.commit.message, date: c.commit.author.date }))
  return _commitsCache
}

interface ApiRelease { tag_name: string; body: string; html_url: string; published_at: string }

export async function getLatestRelease(): Promise<GithubRelease | null> {
  if (_releaseCache !== undefined) return _releaseCache
  const { ok, data } = await getJson<ApiRelease>(`${BASE}/releases/latest`)
  _releaseCache = ok && data
    ? { tagName: data.tag_name, body: data.body ?? '', htmlUrl: data.html_url, publishedAt: data.published_at }
    : null
  return _releaseCache
}

/** Test-only cache reset. */
export function _resetGithubCache(): void {
  _commitsCache = undefined
  _releaseCache = undefined
}
