import type { ChangelogItem, ChangelogGroup } from '../../shared/types'

export type { ChangelogItem, ChangelogGroup }

export interface RawCommit { message: string; sha: string; date: string }

export interface ParsedCommit { type: string; scope: string | null; summary: string }

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/

export function parseConventionalCommit(message: string): ParsedCommit {
  const firstLine = message.split('\n')[0].trim()
  const m = firstLine.match(CONVENTIONAL)
  if (!m) return { type: 'other', scope: null, summary: firstLine }
  return { type: m[1].toLowerCase(), scope: m[2] ?? null, summary: m[3].trim() }
}

// type -> friendly group. Anything unlisted becomes "Improvements".
const GROUP_MAP: Record<string, { group: string }> = {
  feat: { group: 'New' },
  fix: { group: 'Fixes' },
  perf: { group: 'Performance' }
}
const FALLBACK = { group: 'Improvements' }
// Fixed display order of groups.
const GROUP_ORDER = ['New', 'Fixes', 'Performance', 'Improvements']

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

export function humanizeCommits(commits: RawCommit[]): ChangelogGroup[] {
  const buckets = new Map<string, ChangelogGroup>()

  for (const c of commits) {
    const firstLine = c.message.split('\n')[0].trim()
    if (firstLine.startsWith('Merge ')) continue  // drop merge noise

    const parsed = parseConventionalCommit(firstLine)
    const meta = GROUP_MAP[parsed.type] ?? FALLBACK

    if (!buckets.has(meta.group)) {
      buckets.set(meta.group, { group: meta.group, entries: [] })
    }
    buckets.get(meta.group)!.entries.push({
      text: capitalize(parsed.summary),
      sha: c.sha,
      date: c.date
    })
  }

  return GROUP_ORDER
    .map((g) => buckets.get(g))
    .filter((g): g is ChangelogGroup => g !== undefined && g.entries.length > 0)
}
