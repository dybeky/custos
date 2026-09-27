import { app } from 'electron'
import { spawn } from 'child_process'
import { mkdirSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { SESSION_PREFIX, isLegacyLogName, isSessionDirName } from './utils/session-names'

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

/** Delete leftovers of earlier runs and of older versions. Never throws. */
function sweepLeftovers(sessionDir: string, legacyUserData: string): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      const path = join(tmpdir(), name)
      // Another Custos window still running holds its folder open; rm fails
      // on the locked files and the folder is retried next launch.
      if (isSessionDirName(name) && path !== sessionDir) removeQuietly(path)
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
function wipeAfterExit(sessionDir: string): void {
  if (process.platform !== 'win32') {
    removeQuietly(sessionDir)
    return
  }
  const q = `"${sessionDir}"`
  const script = `for /l %i in (1,1,15) do (rmdir /s /q ${q} 2>nul & if not exist ${q} exit /b 0 & ping -n 2 127.0.0.1 >nul)`
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

try {
  mkdirSync(sessionDir, { recursive: true })
  app.setPath('userData', sessionDir)
  app.setPath('sessionData', sessionDir)
} catch {
  // Temp not writable: Electron keeps its default folder for this run; the
  // quit handler below still removes the protocol registration.
}

sweepLeftovers(sessionDir, legacyUserData)

app.on('will-quit', () => {
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
  wipeAfterExit(sessionDir)
})
