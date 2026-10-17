import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { resolveSystemTool, systemCwd } from './system-paths'

const execFileP = promisify(execFile)

/** The key regedit reads its "last opened key" from. */
export const REGEDIT_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit'

/** What LastKey held before Custos first changed it. */
type Backup = { had: true; value: string } | { had: false }
let backup: Backup | null = null

/** The LastKey value in `reg query` output, or null when the output has none. */
export function parseLastKey(stdout: string): string | null {
  const m = /^\s*LastKey\s+REG_SZ\s+(.*?)\s*$/im.exec(stdout)
  return m ? m[1] : null
}

/**
 * Remember regedit's last opened key before Custos points it at a finding, so
 * it can be put back when the program quits (Custos leaves nothing behind).
 * Only the first call records anything: later ones would capture our own value.
 */
export async function rememberRegeditLastKey(): Promise<void> {
  if (backup) return
  try {
    const { stdout } = await execFileP(resolveSystemTool('reg'), ['query', REGEDIT_KEY, '/v', 'LastKey'], {
      timeout: 5000,
      windowsHide: true,
      cwd: systemCwd()
    })
    const value = parseLastKey(String(stdout))
    backup = value === null ? { had: false } : { had: true, value }
  } catch {
    // The value (or the whole key) does not exist yet: deleting it is the undo.
    backup = { had: false }
  }
}

/** Put regedit's last opened key back. Synchronous: it runs while the app quits. */
export function restoreRegeditLastKey(): void {
  if (!backup) return
  const reg = resolveSystemTool('reg')
  const opts = { timeout: 3000, windowsHide: true, cwd: systemCwd(), stdio: 'ignore' as const }
  try {
    if (backup.had) {
      execFileSync(reg, ['add', REGEDIT_KEY, '/v', 'LastKey', '/t', 'REG_SZ', '/d', backup.value, '/f'], opts)
    } else {
      execFileSync(reg, ['delete', REGEDIT_KEY, '/v', 'LastKey', '/f'], opts)
    }
  } catch {
    // already gone, or the registry is locked: nothing more to do
  }
  backup = null
}
