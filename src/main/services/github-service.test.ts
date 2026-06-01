import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRecentCommits, getLatestRelease, _resetGithubCache } from './github-service'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('github-service', () => {
  beforeEach(() => _resetGithubCache())
  afterEach(() => vi.unstubAllGlobals())

  it('maps commits to {message, sha, date}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      { sha: 'abc', commit: { message: 'feat: x', author: { date: '2026-06-01T00:00:00Z' } } }
    ])))
    const commits = await getRecentCommits(5)
    expect(commits[0]).toEqual({ sha: 'abc', message: 'feat: x', date: '2026-06-01T00:00:00Z' })
  })

  it('returns [] when the commits request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false, 500)))
    expect(await getRecentCommits(5)).toEqual([])
  })

  it('returns the latest release', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      tag_name: 'v3.1.0', body: 'notes', html_url: 'https://x/releases/3.1.0', published_at: '2026-06-01T00:00:00Z'
    })))
    const rel = await getLatestRelease()
    expect(rel).toEqual({ tagName: 'v3.1.0', body: 'notes', htmlUrl: 'https://x/releases/3.1.0', publishedAt: '2026-06-01T00:00:00Z' })
  })

  it('returns null when there are no releases (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false, 404)))
    expect(await getLatestRelease()).toBeNull()
  })
})
