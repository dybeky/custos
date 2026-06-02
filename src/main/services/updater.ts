import { app } from 'electron'
import { isNewer } from './semver'
import { getLatestReleaseResult, REPO, type GithubRelease, type ReleaseResult } from './github-service'
import { humanizeCommits } from './changelog'
import type { UpdateInfo } from '../../shared/types'

/** Turn a release body (one bullet per line) into humanized changelog groups. */
function notesFromRelease(rel: GithubRelease): UpdateInfo['notes'] {
  const lines = rel.body.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
  return humanizeCommits(lines.map((message, i) => ({ message, sha: `${rel.tagName}-${i}`, date: rel.publishedAt })))
}

/** Pure decision: compare a current version against a fetched release result. */
export function evaluateUpdate(currentVersion: string, result: ReleaseResult): UpdateInfo {
  if (result.status === 'error') {
    return { updateAvailable: false, checkFailed: true, currentVersion, latestVersion: null, url: null, notes: [] }
  }
  const release = result.release
  if (!release) {
    return { updateAvailable: false, checkFailed: false, currentVersion, latestVersion: null, url: null, notes: [] }
  }
  const updateAvailable = isNewer(release.tagName, currentVersion)
  return {
    updateAvailable,
    checkFailed: false,
    currentVersion,
    latestVersion: release.tagName,
    url: updateAvailable ? `https://github.com/${REPO}/releases/tag/${release.tagName}` : null,
    notes: updateAvailable ? notesFromRelease(release) : []
  }
}

/** Fetch the latest release and evaluate it against the running app version. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const result = await getLatestReleaseResult()
  return evaluateUpdate(app.getVersion(), result)
}
