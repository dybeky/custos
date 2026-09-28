import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getReleaseForVersion, _resetGithubCache } from './github-service'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

const release = (tag: string) => ({
  tag_name: tag, body: '- fix: bug', html_url: 'https://github.com/dybeky/custos/releases/tag/' + tag,
  published_at: '2026-09-28T00:00:00Z', assets: []
})

describe('getReleaseForVersion', () => {
  beforeEach(() => _resetGithubCache())
  afterEach(() => vi.unstubAllGlobals())

  it('finds the release tagged with the bare version', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(release('3.0.1')))
    vi.stubGlobal('fetch', fetchMock)
    expect((await getReleaseForVersion('3.0.1'))?.body).toBe('- fix: bug')
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/releases\/tags\/3\.0\.1$/)
  })

  it('falls back to a v-prefixed tag', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/v3.0.1') ? jsonResponse(release('v3.0.1')) : jsonResponse({}, false, 404)))
    expect((await getReleaseForVersion('3.0.1'))?.tagName).toBe('v3.0.1')
  })

  it('returns null for an unreleased build and remembers it', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 404))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getReleaseForVersion('9.9.9')).toBeNull()
    expect(await getReleaseForVersion('9.9.9')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2) // both tag spellings, once
  })

  it('does not cache a failed request (offline / rate limit)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 403))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getReleaseForVersion('3.0.1')).toBeNull()
    expect(await getReleaseForVersion('3.0.1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
