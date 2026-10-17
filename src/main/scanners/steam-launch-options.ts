import { readdir } from 'fs/promises'
import { readTextCapped } from '../utils/read-capped'

const VDF_MAX_BYTES = 16 * 1024 * 1024
import { join } from 'path'
import { GAMES, type GameId } from '../../shared/games'

/** Launch options that switch a game's protection off or let other code into it. */
export const RISKY_LAUNCH_OPTIONS: ReadonlyArray<{ flag: string; why: string }> = [
  { flag: '-insecure', why: 'starts the game without VAC' },
  { flag: '-allow_third_party_software', why: 'lets other programs load code into the game' }
]

/** Prefix of a launch-option finding; the matcher recognises it (see KeywordMatcher.findKeywordInFinding). */
export const LAUNCH_FINDING_PREFIX = '[Steam Launch Options]'

const STEAM_ID64_BASE = 76561197960265728n

/**
 * The LaunchOptions string a Steam account set for one game, from the text of
 * its userdata\<id>\config\localconfig.vdf (UserLocalConfigStore → Software →
 * Valve → Steam → apps → <appId>). null when none is set.
 */
export function launchOptionsOf(vdf: string, appId: number): string | null {
  const path: string[] = []
  let pendingKey: string | null = null
  for (const raw of vdf.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '{') {
      if (pendingKey !== null) path.push(pendingKey.toLowerCase())
      pendingKey = null
      continue
    }
    if (line === '}') {
      path.pop()
      continue
    }
    const m = /^"((?:[^"\\]|\\.)*)"(?:\s+"((?:[^"\\]|\\.)*)")?$/.exec(line)
    if (!m) continue
    if (m[2] === undefined) {
      pendingKey = m[1]
      continue
    }
    if (m[1].toLowerCase() === 'launchoptions' && path[path.length - 1] === String(appId) && path[path.length - 2] === 'apps') {
      return m[2].replace(/\\(.)/g, '$1')
    }
  }
  return null
}

/** The risky options in a launch-option string. */
export function riskyOptionsIn(options: string): Array<{ flag: string; why: string }> {
  const found = RISKY_LAUNCH_OPTIONS.filter(({ flag }) => options.toLowerCase().split(/\s+/).includes(flag))
  return found
}

/** Findings for the games being checked, one per account and risky option. */
export async function launchOptionFindings(steamRoot: string, game: GameId | null): Promise<string[]> {
  const games = game ? [GAMES[game]] : Object.values(GAMES)
  const userdata = join(steamRoot, 'userdata')
  let accounts: string[]
  try {
    accounts = (await readdir(userdata)).filter((d) => /^\d{1,10}$/.test(d))
  } catch {
    return []
  }
  const out: string[] = []
  for (const account of accounts) {
    let vdf: string
    try {
      vdf = await readTextCapped(join(userdata, account, 'config', 'localconfig.vdf'), VDF_MAX_BYTES)
    } catch {
      continue
    }
    const steamId = (BigInt(account) + STEAM_ID64_BASE).toString()
    for (const g of games) {
      const options = launchOptionsOf(vdf, g.steamAppId)
      if (!options) continue
      for (const { flag, why } of riskyOptionsIn(options)) {
        out.push(`${LAUNCH_FINDING_PREFIX} ${g.name} launch option ${flag} (${why}) | SteamID: ${steamId}`)
      }
    }
  }
  return out
}
