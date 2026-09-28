import { app } from 'electron'
import { spawn } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { createWriteStream, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { isNewer } from './semver'
import { getLatestReleaseResult, REPO, type GithubAsset, type GithubRelease, type ReleaseResult } from './github-service'
import { humanizeCommits } from './changelog'
import { logger } from './logger'
import { UPDATE_FILE_PREFIX } from '../utils/session-names'
import type { UpdateInfo, UpdateProgress } from '../../shared/types'

/** Turn a release body (one bullet per line) into humanized changelog groups. */
function notesFromRelease(rel: GithubRelease): UpdateInfo['notes'] {
  const lines = rel.body.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean).slice(0, 100)
  return humanizeCommits(lines.map((message, i) => ({ message, sha: `${rel.tagName}-${i}`, date: rel.publishedAt })))
}

/** Largest exe we are willing to download (the current build is ~80 MB). */
const MAX_UPDATE_BYTES = 400 * 1024 * 1024

/**
 * The release asset this build can replace itself with: `custos-<arch>.exe`,
 * or the pre-3.0 `custos.exe` on x64. Only assets GitHub published a SHA-256
 * for qualify — without one the download could not be verified.
 */
export function pickAsset(assets: GithubAsset[] | undefined, arch: string): GithubAsset | null {
  const wanted = [`custos-${arch}.exe`, ...(arch === 'x64' ? ['custos.exe'] : [])]
  for (const name of wanted) {
    const a = (assets ?? []).find((x) => x.name.toLowerCase() === name)
    if (!a || !a.sha256 || a.size <= 0 || a.size > MAX_UPDATE_BYTES) continue
    try {
      const u = new URL(a.url)
      if (u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${REPO}/releases/download/`)) return a
    } catch {
      // malformed URL — skip
    }
  }
  return null
}

/** Pure decision: compare a current version against a fetched release result. */
export function evaluateUpdate(
  currentVersion: string,
  result: ReleaseResult,
  arch: string = process.arch
): UpdateInfo & { asset: GithubAsset | null } {
  const none = { updateAvailable: false, currentVersion, latestVersion: null, url: null, notes: [], canInstall: false, asset: null }
  if (result.status === 'error') return { ...none, checkFailed: true }
  const release = result.release
  if (!release) return { ...none, checkFailed: false }
  const updateAvailable = isNewer(release.tagName, currentVersion)
  const asset = updateAvailable ? pickAsset(release.assets, arch) : null
  return {
    updateAvailable,
    checkFailed: false,
    currentVersion,
    latestVersion: release.tagName,
    url: updateAvailable ? `https://github.com/${REPO}/releases/tag/${encodeURIComponent(release.tagName)}` : null,
    notes: updateAvailable ? notesFromRelease(release) : [],
    canInstall: asset !== null,
    asset
  }
}

/** The portable exe the user launched; null in dev and in unpacked builds. */
function launchedExe(): string | null {
  return app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE || null : null
}

// Asset of the newest release seen by checkForUpdate — the only thing
// installUpdate will download (the renderer cannot pass a URL of its own).
let pendingAsset: GithubAsset | null = null
let installing = false

/** Fetch the latest release and evaluate it against the running app version. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const result = await getLatestReleaseResult()
  const { asset, ...info } = evaluateUpdate(app.getVersion(), result)
  pendingAsset = asset
  return { ...info, canInstall: info.canInstall && launchedExe() !== null }
}

/** Stream `asset` to `dest`, hashing as it goes; throws unless size, header and SHA-256 match. */
export async function downloadVerified(
  asset: GithubAsset,
  dest: string,
  onProgress: (p: UpdateProgress) => void,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const res = await fetchImpl(asset.url, { headers: { 'User-Agent': 'custos-app' }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`)
  const hash = createHash('sha256')
  const out = createWriteStream(dest)
  const closed = new Promise<void>((resolve, reject) => {
    out.once('close', () => resolve())
    out.once('error', reject)
  })
  let received = 0
  let head = ''
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > asset.size) throw new Error('Download is larger than the release says')
      if (head.length < 2) head += Buffer.from(value.subarray(0, 2 - head.length)).toString('latin1')
      hash.update(value)
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      onProgress({ received, total: asset.size })
    }
  } finally {
    out.end()
    await closed
  }
  if (received !== asset.size) throw new Error('Download is incomplete')
  if (head !== 'MZ') throw new Error('Download is not a Windows program')
  if (hash.digest('hex') !== asset.sha256) throw new Error('Download does not match the published SHA-256')
}

/**
 * Once this process and the portable launcher are gone, move the new exe over
 * the old one and start it. A hidden cmd retries while the launcher still
 * holds the file; if it never frees up, the download is deleted and the old
 * exe stays as it was.
 */
export function swapScript(src: string, dest: string): string {
  const s = `"${src}"`
  const d = `"${dest}"`
  // The loop MUST be parenthesised: cmd treats everything after `do (…)` —
  // including a trailing `& del` — as part of the loop body, which would
  // delete the download after the first failed attempt.
  return `(for /l %i in (1,1,40) do (move /y ${s} ${d} >nul 2>&1 && (start "" ${d} & exit /b 0) & ping -n 2 127.0.0.1 >nul)) & del /f /q ${s} 2>nul`
}

function scheduleSwap(src: string, dest: string): void {
  spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', swapScript(src, dest)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true
  }).unref()
}

/**
 * Download the release found by the last check, verify it, and restart into
 * it. Throws on failure (the old exe is untouched); on success the app quits.
 */
export async function installUpdate(onProgress: (p: UpdateProgress) => void): Promise<void> {
  const target = launchedExe()
  const asset = pendingAsset
  if (!target || !asset) throw new Error('This build cannot update itself — download it from the release page.')
  if (installing) throw new Error('Update already in progress')
  installing = true
  const tmp = join(tmpdir(), `${UPDATE_FILE_PREFIX}${randomBytes(8).toString('hex')}.exe`)
  try {
    await downloadVerified(asset, tmp, onProgress)
  } catch (err) {
    installing = false
    rmSync(tmp, { force: true })
    logger.warn('Update download failed', { error: err instanceof Error ? err.message : String(err) })
    throw err
  }
  logger.info('Update verified, restarting', { asset: asset.name })
  scheduleSwap(tmp, target)
  // Let the IPC reply reach the renderer before the window goes away.
  setTimeout(() => app.quit(), 300)
}
