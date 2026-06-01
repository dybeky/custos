import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore } from './game-store'

describe('game store', () => {
  beforeEach(() => useGameStore.setState({ selectedGame: null }))

  it('starts with no game selected (picker shows every launch)', () => {
    expect(useGameStore.getState().selectedGame).toBeNull()
  })

  it('sets the selected game', () => {
    useGameStore.getState().setSelectedGame('unturned')
    expect(useGameStore.getState().selectedGame).toBe('unturned')
  })
})
