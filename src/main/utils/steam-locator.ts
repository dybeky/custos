import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFileAsync } from './async-exec'

/** Library roots listed in Steam's libraryfolders.vdf (the "path" entries). */
export function parseLibraryFolders(vdf: string): string[] {
  return [...vdf.matchAll(/"path"\s+"([^"]+)"/gi)].map((m) => m[1].replace(/\\\\/g, '\\'))
}

/** Steam's install folder: the registry first, then the usual locations. */
export async function findSteamRoot(): Promise<string | null> {
  try {
    // Decoded from the console code page: the path may hold a non-ASCII user name.
    const { stdout } = await execFileAsync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { timeoutMs: 5000 })
    const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout)
    const p = m?.[1].trim().replace(/\//g, '\\')
    if (p && existsSync(p)) return p
  } catch {
    // no Steam key — try the defaults
  }
  for (const p of [
    join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Steam'),
    join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Steam')
  ]) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Where Steam and a game live on this PC. `game` is the game's folder under
 * steamapps\common (e.g. "Unturned"); null when Steam or the game isn't found.
 */
export async function locateSteam(game: string): Promise<{ steam: string | null; game: string | null }> {
  const steam = await findSteamRoot()
  if (!steam) return { steam: null, game: null }
  const libraries = [steam]
  try {
    libraries.push(...parseLibraryFolders(readFileSync(join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf-8')))
  } catch {
    // no library file — only the main library
  }
  for (const lib of libraries) {
    const dir = join(lib, 'steamapps', 'common', game)
    if (existsSync(dir)) return { steam, game: dir }
  }
  return { steam, game: null }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/

export type SteamTarget =
  | { kind: 'steam'; sub: string[] }
  | { kind: 'game'; game: string; sub: string[] }

/**
 * What a "Manual" button asks for: '' is Steam's own folder, 'Name' a game
 * folder under steamappscommon, 'Name/Sub/Dir' a folder inside the game, and
 * '@steam/Sub/Dir' a folder inside Steam itself. Only plain folder names are
 * accepted (no '..', no drive letters, no backslashes), so the renderer can
 * never steer this outside Steam's folders. Null when the text is not valid.
 */
export function parseSteamTarget(spec: string): SteamTarget | null {
  if (spec === '') return { kind: 'steam', sub: [] }
  const parts = spec.split('/')
  const steamRoot = parts[0] === '@steam'
  const names = steamRoot ? parts.slice(1) : parts
  if (names.length === 0 || names.length > 6) return null
  if (!names.every((n) => SEGMENT.test(n) && !n.endsWith('.') && !n.endsWith(' '))) return null
  return steamRoot ? { kind: 'steam', sub: names } : { kind: 'game', game: names[0], sub: names.slice(1) }
}

/** The folder a Manual button points at on this PC, or null when it is not there. */
export async function locateSteamTarget(spec: string): Promise<string | null> {
  const target = parseSteamTarget(spec)
  if (!target) return null
  if (target.kind === 'steam') {
    const steam = await findSteamRoot()
    if (!steam) return null
    const dir = join(steam, ...target.sub)
    return existsSync(dir) ? dir : null
  }
  const { game } = await locateSteam(target.game)
  if (!game) return null
  const dir = join(game, ...target.sub)
  return existsSync(dir) ? dir : null
}
