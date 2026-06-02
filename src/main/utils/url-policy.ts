/**
 * Pure URL/path policy predicates for the privileged shell.open* IPC handlers.
 * No electron import → unit-testable on any platform.
 *
 * Trust boundary: these run in the main process. Renderer callers pass constants
 * today, but a renderer compromise or a spoofed network value (e.g. a GitHub
 * release html_url) must never reach shell.openExternal/openPath unchecked.
 */

/**
 * Allowlist of inert document extensions that are safe to hand to
 * shell.openPath (opened with their default viewer). Legitimate callers only
 * ever open directories (no extension) or these document types — so rather than
 * chase an ever-incomplete denylist of launchable extensions (.exe/.lnk/.url/
 * .scf/.settingcontent-ms/…, many of which ShellExecute will run), we reject
 * anything with an extension that is not on this list.
 */
const SAFE_OPEN_EXT = /\.(txt|log|json|csv|md|pdf|png|jpe?g|gif|webp)$/i

/** A leading "<scheme>:" that is NOT a drive-letter path like C:\ or C:/. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const DRIVE_LETTER = /^[A-Za-z]:[\\/]/
const UNC = /^\\\\/

/** Expand %VAR% references from the process environment (empty string if unset). */
export function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] || '')
}

/** True when a URL is safe to hand to shell.openExternal. */
export function isAllowedExternalUrl(url: string): boolean {
  let scheme: string
  try {
    scheme = new URL(url).protocol.replace(/:$/, '').toLowerCase()
  } catch {
    return false
  }
  if (scheme === 'https') return true
  if (scheme === 'windowsdefender') return true
  // Only allow ms-settings deep-links. ms-msdt is deliberately excluded: it is
  // the MSDT Follina exploit vector (CVE-2022-30190) and must never be opened.
  if (scheme === 'ms-settings') return true
  return false
}

/** True when a path (after %ENV% expansion) is safe to hand to shell.openPath. */
export function isAllowedLocalPath(rawPath: string): boolean {
  const p = expandEnv(rawPath)
  // URI scheme that is not a drive-letter path → defer to the external policy.
  if (URI_SCHEME.test(p) && !DRIVE_LETTER.test(p)) return isAllowedExternalUrl(p)
  // Control characters are invalid in Windows paths; a NUL in particular would
  // make ShellExecuteW truncate the path (e.g. "evil.exe\0.txt" → run evil.exe).
  for (let i = 0; i < p.length; i++) {
    if (p.charCodeAt(i) < 0x20) return false
  }
  if (UNC.test(p)) return false
  if (!DRIVE_LETTER.test(p)) return false
  // Reject NTFS alternate-data-stream syntax (any colon past the drive letter),
  // e.g. "C:\p.exe::$DATA" or "C:\notes.txt:hidden.exe" — these name a stream
  // Windows can resolve to an executable.
  if (p.indexOf(':', 2) !== -1) return false
  // Allowlist model. Take the *Windows-normalized* final path component:
  // ShellExecute ignores trailing separators and strips trailing spaces/dots
  // before launching, so use the last non-empty segment with those stripped.
  // A directory has no extension (a leading-dot name like ".ssh" is a directory,
  // not an extension); only the inert document allowlist is permitted, and every
  // executable/script/shortcut — known or unknown — is rejected by default.
  const segments = p.split(/[\\/]/).filter((s) => s.length > 0)
  const finalSegment = (segments[segments.length - 1] ?? '').replace(/[\s.]+$/, '')
  if (finalSegment.lastIndexOf('.') > 0 && !SAFE_OPEN_EXT.test(finalSegment)) return false
  return true
}
