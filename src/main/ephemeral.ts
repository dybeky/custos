import { app } from 'electron'
import { spawn } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'
import { LOCK_DIR_NAME, SESSION_PREFIX, isLauncherDirName, isLegacyLogName, isSessionDirName, isUpdateFileName } from './utils/session-names'

/**
 * Custos runs on the checked player's PC and must leave nothing behind.
 *
 * Everything the app writes — Chromium caches, settings, the (encrypted)
 * login, saved checks, the downloaded signature cache and the log — goes to a
 * per-launch folder under %TEMP%, which is wiped when the app quits. A run
 * that crashed before it could clean up is swept on the next launch, together
 * with the %APPDATA%\custos folder and next-to-exe log files older versions
 * left behind.
 *
 * This module must be imported before anything that resolves app paths
 * (electron-store, the logger): it redirects `userData` at import time.
 */

function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 2 })
  } catch {
    // still locked by a running copy, or already gone
  }
}

/**
 * The portable exe unpacks the app (~270 MB) to a random %TEMP% folder and
 * deletes it on a normal exit — but not when the process is killed or the PC
 * loses power. Such a folder is ours if it holds Custos.exe next to an
 * app.asar, and stale if that exe can be opened for writing (Windows refuses
 * that while a copy is running, so a live Custos is never touched).
 */
function isStaleLauncherDir(path: string): boolean {
  const exe = join(path, 'Custos.exe')
  if (join(path) === dirname(process.execPath)) return false
  if (!existsSync(exe) || !existsSync(join(path, 'resources', 'app.asar'))) return false
  try {
    closeSync(openSync(exe, 'r+'))
    return true
  } catch {
    return false // running (or unreadable) — leave it
  }
}

/** Delete leftovers of earlier runs and of older versions. Never throws. */
function sweepLeftovers(sessionDir: string, legacyUserData: string): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      const path = join(tmpdir(), name)
      // Another Custos window still running holds its folder open; rm fails
      // on the locked files and the folder is retried next launch.
      if (isSessionDirName(name) && path !== sessionDir) removeQuietly(path)
      else if (isUpdateFileName(name)) removeQuietly(path) // an update whose swap never ran
      else if (isLauncherDirName(name) && isStaleLauncherDir(path)) removeQuietly(path)
    }
  } catch {
    // temp folder unreadable — nothing to sweep
  }
  removeQuietly(legacyUserData)
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (exeDir) {
    try {
      for (const name of readdirSync(exeDir)) if (isLegacyLogName(name)) removeQuietly(join(exeDir, name))
    } catch {
      // folder unreadable — leave it
    }
  }
}

/**
 * Remove the session folder once this process (and Chromium's helpers, which
 * hold cache files open until they exit) are gone. A hidden cmd retries for a
 * few seconds; anything it still cannot delete is swept on the next launch.
 */
function wipeAfterExit(sessionDir: string, lockDir: string): void {
  if (process.platform !== 'win32') {
    removeQuietly(sessionDir)
    removeQuietly(lockDir)
    return
  }
  const q = `"${sessionDir}"`
  // The lock folder goes too; if a new Custos already holds it, its lock file
  // is in use and rmdir leaves it alone.
  const l = `"${lockDir}"`
  const script = `for /l %i in (1,1,15) do (rmdir /s /q ${q} 2>nul & rmdir /s /q ${l} 2>nul & if not exist ${q} exit /b 0 & ping -n 2 127.0.0.1 >nul)`
  try {
    spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true
    }).unref()
  } catch {
    // the next launch sweeps it
  }
}

const legacyUserData = app.getPath('userData')
const sessionDir = join(tmpdir(), SESSION_PREFIX + randomBytes(8).toString('hex'))

/**
 * Electron's single-instance lock is keyed on the userData folder. The session
 * folder is random per launch, so taking the lock there would never see a
 * running Custos: a custos:// sign-in link would open a second app instead of
 * reaching the first, and that second app's sweep would delete the running
 * one's files. The lock is therefore taken on one fixed folder first, and only
 * the instance that owns it switches to a session folder and sweeps.
 */
const lockDir = join(tmpdir(), LOCK_DIR_NAME)
try {
  mkdirSync(lockDir, { recursive: true })
  app.setPath('userData', lockDir)
} catch {
  // Temp not writable: lock on Electron's default folder instead.
}

/** False in a second launch that only forwards its argv (a deep link) and quits. */
export const ownsInstanceLock = app.requestSingleInstanceLock()

if (ownsInstanceLock) {
  try {
    mkdirSync(sessionDir, { recursive: true })
    app.setPath('userData', sessionDir)
    app.setPath('sessionData', sessionDir)
  } catch {
    // Temp not writable: Electron keeps the lock folder for this run; the
    // quit handler below still removes the protocol registration.
  }
  sweepLeftovers(sessionDir, legacyUserData)
}

app.on('will-quit', () => {
  // A forwarding second launch owns nothing: the protocol registration and
  // the folders belong to the running instance.
  if (!ownsInstanceLock) return
  // The custos:// sign-in link is registered each launch (it points at this
  // run's unpacked exe) and must not outlive it.
  try {
    // Same arguments as the registration in index.ts (dev runs register the
    // electron binary plus the script path).
    if (process.defaultApp && process.argv.length >= 2) {
      app.removeAsDefaultProtocolClient('custos', process.execPath, [process.argv[1]])
    } else {
      app.removeAsDefaultProtocolClient('custos')
    }
  } catch {
    // not registered
  }
  wipeAfterExit(sessionDir, lockDir)
})
