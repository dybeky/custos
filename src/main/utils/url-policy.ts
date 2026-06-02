/**
 * Pure URL/path policy predicates for the privileged shell.open* IPC handlers.
 * No electron import → unit-testable on any platform.
 *
 * Trust boundary: these run in the main process. Renderer callers pass constants
 * today, but a renderer compromise or a spoofed network value (e.g. a GitHub
 * release html_url) must never reach shell.openExternal/openPath unchecked.
 */

/** Extensions that shell.openPath would launch as a program — never allowed. */
const EXECUTABLE_EXT =
  /\.(exe|bat|cmd|com|scr|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|lnk|cpl|hta|pif|reg|jar|gadget)$/i

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
  if (UNC.test(p)) return false
  if (!DRIVE_LETTER.test(p)) return false
  if (EXECUTABLE_EXT.test(p)) return false
  return true
}
