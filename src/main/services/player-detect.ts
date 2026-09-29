import { readFile } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ScanPlayer } from '../../shared/types'
import { findSteamRoot } from '../utils/steam-locator'
import { VdfParser, type SteamAccount } from './vdf-parser'
import { logger } from './logger'

const execFileP = promisify(execFile)

/** SteamID64 of the individual-account universe: base + 32-bit account id. */
const STEAMID64_BASE = 76561197960265728n

export function steamId64FromAccountId(accountId: number): string {
  return (STEAMID64_BASE + BigInt(accountId)).toString()
}

/** Steam's "ActiveUser" DWORD from `reg query` output; null when signed out (0) or absent. */
export function parseActiveUser(regOutput: string): number | null {
  const m = /ActiveUser\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(regOutput)
  if (!m) return null
  const id = parseInt(m[1], 16)
  return id > 0 ? id : null
}

/**
 * Who is being checked: the account Steam is signed in to right now, else the
 * one that signed in last (MostRecent, then the newest timestamp). Null when
 * the PC has no Steam accounts.
 */
export function pickPlayer(accounts: SteamAccount[], activeAccountId: number | null): ScanPlayer | null {
  const toPlayer = (a: SteamAccount, source: ScanPlayer['source']): ScanPlayer => ({
    steamId: a.steamId,
    accountName: a.accountName,
    ...(a.personaName ? { personaName: a.personaName } : {}),
    source
  })
  if (activeAccountId !== null) {
    const steamId = steamId64FromAccountId(activeAccountId)
    const active = accounts.find((a) => a.steamId === steamId)
    // Signed in but never saved to loginusers.vdf: the id alone still identifies the player.
    return active ? toPlayer(active, 'running') : { steamId, accountName: '', source: 'running' }
  }
  const recent =
    accounts.find((a) => a.mostRecent) ??
    [...accounts].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0]
  return recent ? toPlayer(recent, 'recent') : null
}

async function readActiveUser(): Promise<number | null> {
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileP('reg', ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser'], {
      windowsHide: true,
      timeout: 5000
    })
    return parseActiveUser(stdout)
  } catch {
    return null // Steam never ran on this account
  }
}

async function readAccounts(): Promise<SteamAccount[]> {
  const root = await findSteamRoot()
  if (!root) return []
  try {
    return new VdfParser().parseSteamAccounts(await readFile(join(root, 'config', 'loginusers.vdf'), 'utf-8'))
  } catch {
    return []
  }
}

/** Detect the checked player's Steam account. Never throws. */
export async function detectSteamPlayer(): Promise<ScanPlayer | null> {
  try {
    const [accounts, active] = await Promise.all([readAccounts(), readActiveUser()])
    return pickPlayer(accounts, active)
  } catch (err) {
    logger.warn('Player detection failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
