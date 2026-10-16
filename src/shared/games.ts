export type GameId = 'unturned' | 'cs2'

export interface GameMeta {
  id: GameId
  name: string
  available: boolean      // false → shown as "Coming soon", not selectable
  processNames: string[]  // executable names matched by the live process-locator
  steamAppId: number      // the game's Steam app id (launch options, userdata folder)
  /**
   * Live Scan reads the running game's memory with Unity/Mono detectors and a
   * Unity module allow-list. It is only meaningful for games built that way.
   */
  liveScan: boolean
}

export const GAMES: Record<GameId, GameMeta> = {
  unturned: {
    id: 'unturned',
    name: 'Unturned',
    available: true,
    processNames: ['Unturned.exe'],
    steamAppId: 304930,
    liveScan: true
  },
  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2',
    available: true,
    processNames: ['cs2.exe'],
    steamAppId: 730,
    liveScan: false
  }
}

export const GAME_IDS: GameId[] = ['unturned', 'cs2']

/** Whether Live Scan may read this game's memory (the main process refuses anything else, e.g. VAC-protected CS2). */
export function allowsLiveScan(gameId: string): boolean {
  return Object.hasOwn(GAMES, gameId) && GAMES[gameId as GameId].liveScan
}
