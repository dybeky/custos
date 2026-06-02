import { shell } from 'electron'
import { logger } from '../services/logger'
import { expandEnv, isAllowedExternalUrl, isAllowedLocalPath } from './url-policy'

const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const DRIVE_LETTER = /^[A-Za-z]:[\\/]/

/** Validate then open an external URL; drop + log anything not on the scheme allowlist. */
export function safeOpenExternal(url: string): void {
  if (!isAllowedExternalUrl(url)) {
    logger.warn('Blocked external open (scheme not allowed)', { url })
    return
  }
  shell.openExternal(url).catch((err) =>
    logger.warn('Failed to open external URL', { url, error: err instanceof Error ? err.message : String(err) })
  )
}

/** Expand %ENV%, route URI schemes to safeOpenExternal, else validate + openPath. */
export function safeOpenPath(rawPath: string): void {
  const expanded = expandEnv(rawPath)
  if (URI_SCHEME.test(expanded) && !DRIVE_LETTER.test(expanded)) {
    safeOpenExternal(expanded)
    return
  }
  if (!isAllowedLocalPath(rawPath)) {
    logger.warn('Blocked path open (not an allowed local path)', { path: expanded })
    return
  }
  shell.openPath(expanded).catch((err) =>
    logger.warn('Failed to open path', { path: expanded, error: err instanceof Error ? err.message : String(err) })
  )
}
