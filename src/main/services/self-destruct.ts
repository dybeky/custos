import { app } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { logger } from './logger'

/**
 * Validates a path intended for use inside a Windows batch file.
 * Throws if the path contains control characters or is not an absolute Windows path.
 */
export const validateBatchPath = (path: string): void => {
  // Reject control characters that could inject commands (\r\n, \x00, etc.)
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if ((code >= 0 && code <= 0x1f) || code === 0x7f) {
      throw new Error('Path contains invalid control characters')
    }
  }
  // Ensure path is an absolute Windows path
  if (!/^[A-Z]:\\/i.test(path)) {
    throw new Error('Path must be an absolute Windows path')
  }
}

/**
 * Escapes batch metacharacters in a Windows path so it can be safely
 * embedded inside a batch file command. Calls validateBatchPath first.
 */
export const escapeBatchPath = (path: string): string => {
  validateBatchPath(path)
  return path
    .replace(/\^/g, '^^')
    .replace(/&/g, '^&')
    .replace(/\|/g, '^|')
    .replace(/</g, '^<')
    .replace(/>/g, '^>')
    .replace(/"/g, '""')
    .replace(/%/g, '%%')
}

/**
 * Creates and launches a cleanup batch file that deletes the exe after app closes.
 * Used by both "delete now" and "delete after use" features.
 */
export function scheduleSelfDestruct(exePath: string): void {
  const escapedPath = escapeBatchPath(exePath)

  const batchContent = `@echo off
:loop
tasklist /FI "IMAGENAME eq Custos.exe" 2>NUL | find /i "Custos.exe" >nul
if %errorlevel%==0 (
  timeout /t 1 /nobreak >nul
  goto loop
)
del "${escapedPath}"
del "%~f0"
`
  const batchPath = join(app.getPath('temp'), 'custos_cleanup.bat')
  writeFileSync(batchPath, batchContent, 'utf8')

  // 'start' is a cmd.exe built-in, so we must invoke cmd.exe explicitly.
  // batchPath is fully controlled (app temp dir + hardcoded filename) — no
  // user input reaches this call, but execFile is used for correctness.
  execFile('cmd.exe', ['/c', 'start', '', batchPath], { windowsHide: true }, (err) => {
    if (err) {
      logger.error('Failed to start cleanup batch:', err)
    }
  })
}
