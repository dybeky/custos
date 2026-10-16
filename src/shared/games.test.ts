import { describe, it, expect } from 'vitest'
import { GAMES, GAME_IDS, type GameId } from './games'

describe('games registry', () => {
  it('marks Unturned as available with a process name', () => {
    expect(GAMES.unturned.available).toBe(true)
    expect(GAMES.unturned.processNames).toContain('Unturned.exe')
  })

  it('marks CS2 as available, with its process and Steam app', () => {
    expect(GAMES.cs2.available).toBe(true)
    expect(GAMES.cs2.processNames).toContain('cs2.exe')
    expect(GAMES.cs2.steamAppId).toBe(730)
  })

  it('offers Live Scan only for the Unity game', () => {
    expect(GAMES.unturned.liveScan).toBe(true)
    expect(GAMES.cs2.liveScan).toBe(false)
  })

  it('exposes a stable id list matching the record keys', () => {
    expect(GAME_IDS).toEqual(['unturned', 'cs2'])
    GAME_IDS.forEach((id: GameId) => expect(GAMES[id].id).toBe(id))
  })
})
