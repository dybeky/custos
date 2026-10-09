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
