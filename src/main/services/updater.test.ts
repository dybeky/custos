import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateUpdate } from './updater'
import type { GithubRelease } from './github-service'

const rel = (tag: string): GithubRelease => ({
  tagName: tag, body: 'feat: shiny\nfix: bug', htmlUrl: 'https://x/r/' + tag, publishedAt: '2026-06-01T00:00:00Z'
})

describe('evaluateUpdate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports an update when the release tag is newer', () => {
    const info = evaluateUpdate('3.0.0', rel('v3.1.0'))
    expect(info.updateAvailable).toBe(true)
    expect(info.latestVersion).toBe('v3.1.0')
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v3.1.0')
    expect(info.notes.length).toBeGreaterThan(0)
  })

  it('reports no update when current is up to date', () => {
    const info = evaluateUpdate('3.1.0', rel('v3.1.0'))
    expect(info.updateAvailable).toBe(false)
  })

  it('reports no update when there is no release', () => {
    const info = evaluateUpdate('3.0.0', null)
    expect(info.updateAvailable).toBe(false)
    expect(info.latestVersion).toBeNull()
  })
})

describe('evaluateUpdate URL', () => {
  const evilRel = (tag: string): GithubRelease => ({
    tagName: tag, body: '- New thing', htmlUrl: 'https://evil.example/pwn', publishedAt: '2026-01-01T00:00:00Z'
  })

  it('builds the download URL from REPO, ignoring the API html_url', () => {
    const info = evaluateUpdate('1.0.0', evilRel('v2.0.0'))
    expect(info.updateAvailable).toBe(true)
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v2.0.0')
    expect(info.url).not.toContain('evil.example')
  })
})
