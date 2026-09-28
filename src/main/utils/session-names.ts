/** Prefix of the per-launch folder under %TEMP% (see ephemeral.ts). */
export const SESSION_PREFIX = 'custos-session-'

/**
 * A folder name that is a Custos session folder and safe to delete. Strict on
 * purpose: the sweep deletes whatever matches, so nothing else in %TEMP% may.
 */
export function isSessionDirName(name: string): boolean {
  return /^custos-session-[0-9a-f]{16}$/.test(name)
}

/** Log files written next to the exe by versions before the session folder. */
export function isLegacyLogName(name: string): boolean {
  return /^custos-log-\d{4}-\d{2}-\d{2}\.txt$/.test(name)
}

/** Prefix of a downloaded update waiting to replace the exe (see updater.ts). */
export const UPDATE_FILE_PREFIX = 'custos-update-'

/** A downloaded update left in %TEMP% by a swap that never ran. */
export function isUpdateFileName(name: string): boolean {
  return /^custos-update-[0-9a-f]{16}\.exe$/.test(name)
}
