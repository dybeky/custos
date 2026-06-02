import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getRecentCommits, _resetGithubCache } from './github-service'

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
})
