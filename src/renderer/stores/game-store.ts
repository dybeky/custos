import { create } from 'zustand'
import type { GameId } from '../../shared/games'

interface GameState {
  selectedGame: GameId | null
  setSelectedGame: (id: GameId) => void
}

export const useGameStore = create<GameState>((set) => ({
  selectedGame: null,
  setSelectedGame: (id) => set({ selectedGame: id })
}))
