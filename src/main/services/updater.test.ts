import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateUpdate } from './updater'
import type { GithubRelease } from './github-service'

const rel = (tag: string): GithubRelease => ({
  tagName: tag, body: 'feat: shiny\nfix: bug', htmlUrl: 'https://x/r/' + tag, publishedAt: '2026-06-01T00:00:00Z'
})

describe('evaluateUpdate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports an update when the release tag is newer', () => {
    const info = evaluateUpdate('3.0.0', { status: 'ok', release: rel('v3.1.0') })
    expect(info.updateAvailable).toBe(true)
    expect(info.latestVersion).toBe('v3.1.0')
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v3.1.0')
    expect(info.notes.length).toBeGreaterThan(0)
  })

  it('reports no update when current is up to date', () => {
    const info = evaluateUpdate('3.1.0', { status: 'ok', release: rel('v3.1.0') })
    expect(info.updateAvailable).toBe(false)
  })

  it('reports no update when there is no release', () => {
    const info = evaluateUpdate('3.0.0', { status: 'ok', release: null })
    expect(info.updateAvailable).toBe(false)
    expect(info.latestVersion).toBeNull()
  })
})

describe('evaluateUpdate tri-state', () => {
  it('marks checkFailed when the release fetch errored', () => {
    const info = evaluateUpdate('1.0.0', { status: 'error', release: null })
    expect(info.checkFailed).toBe(true)
    expect(info.updateAvailable).toBe(false)
  })
  it('reports up-to-date distinctly from a failed check', () => {
    const info = evaluateUpdate('2.0.0', { status: 'ok', release: { tagName: 'v2.0.0', body: '', htmlUrl: '', publishedAt: '' } })
    expect(info.checkFailed).toBe(false)
    expect(info.updateAvailable).toBe(false)
  })
})

describe('evaluateUpdate URL', () => {
  const evilRel = (tag: string): GithubRelease => ({
    tagName: tag, body: '- New thing', htmlUrl: 'https://evil.example/pwn', publishedAt: '2026-01-01T00:00:00Z'
  })

  it('builds the download URL from REPO, ignoring the API html_url', () => {
    const info = evaluateUpdate('1.0.0', { status: 'ok', release: evilRel('v2.0.0') })
    expect(info.updateAvailable).toBe(true)
    expect(info.url).toBe('https://github.com/dybeky/custos/releases/tag/v2.0.0')
    expect(info.url).not.toContain('evil.example')
  })
})
