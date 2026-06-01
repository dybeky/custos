import { describe, it, expect } from 'vitest'
import { parseConventionalCommit, humanizeCommits } from './changelog'

describe('parseConventionalCommit', () => {
  it('splits type, scope and summary', () => {
    expect(parseConventionalCommit('feat(scan): add bam detector')).toEqual({
      type: 'feat', scope: 'scan', summary: 'add bam detector'
    })
  })
  it('handles no scope', () => {
    expect(parseConventionalCommit('fix: parse dns format')).toEqual({
      type: 'fix', scope: null, summary: 'parse dns format'
    })
  })
  it('falls back to type "other" for non-conventional messages', () => {
    expect(parseConventionalCommit('random commit')).toEqual({
      type: 'other', scope: null, summary: 'random commit'
    })
  })
})

describe('humanizeCommits', () => {
  it('groups commits into friendly buckets and drops merges', () => {
    const groups = humanizeCommits([
      { message: 'feat: live scan', sha: 'a1', date: '2026-06-01' },
      { message: 'fix: crash on start', sha: 'b2', date: '2026-06-01' },
      { message: 'build: bump electron', sha: 'c3', date: '2026-06-01' },
      { message: "Merge pull request #4 from x", sha: 'd4', date: '2026-06-01' }
    ])
    const byGroup = Object.fromEntries(groups.map(g => [g.group, g.entries.length]))
    expect(byGroup['New']).toBe(1)
    expect(byGroup['Fixes']).toBe(1)
    expect(byGroup['Improvements']).toBe(1)
    expect(groups.every(g => g.entries.every(e => !e.text.startsWith('Merge')))).toBe(true)
  })
  it('capitalizes the summary text', () => {
    const groups = humanizeCommits([{ message: 'feat: shiny thing', sha: 'a1', date: '2026-06-01' }])
    expect(groups[0].entries[0].text).toBe('Shiny thing')
  })
})
