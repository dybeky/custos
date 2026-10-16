/**
 * Hands an error from the window to the main process, which sends it to the
 * site (see main/services/crash-reporter). Never throws; the same error is only
 * forwarded once per window session so a render loop cannot flood the channel.
 */
const forwarded = new Set<string>()

export function reportWindowError(error: unknown): void {
  try {
    const e = error instanceof Error ? error : null
    const message = (e ? `${e.name}: ${e.message}` : String(error)).slice(0, 3000)
    if (!message || forwarded.has(message) || forwarded.size >= 20) return
    forwarded.add(message)
    window.electronAPI?.reportError?.({ message, stack: e?.stack?.slice(0, 12000) })
  } catch {
    // reporting is best effort
  }
}
