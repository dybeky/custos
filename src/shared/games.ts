export type GameId = 'unturned' | 'cs2'

export interface GameMeta {
  id: GameId
  name: string
  available: boolean      // false → shown as "Coming soon", not selectable
  processNames: string[]  // executable names matched by the live process-locator
}

export const GAMES: Record<GameId, GameMeta> = {
  unturned: {
    id: 'unturned',
    name: 'Unturned',
    available: true,
    processNames: ['Unturned.exe']
  },
  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2',
    available: false,
    processNames: ['cs2.exe']
  }
}

export const GAME_IDS: GameId[] = ['unturned', 'cs2']
