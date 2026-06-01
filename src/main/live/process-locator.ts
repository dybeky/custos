/**
 * Locates the Unturned game process in the running process list.
 *
 * Uses the memoryjs wrapper — returns null when native is unavailable or the
 * game is not currently running.
 */

import { listProcesses } from './native/memory'

/** Configurable list of executable names to match (lowercased). */
const GAME_PROCESS_NAMES: string[] = ['unturned.exe']

export interface GameProcess {
  pid: number
  name: string
}

/**
 * Scan the system process list for a running Unturned instance.
 *
 * @param candidates Override the default process name list (mainly for tests).
 * @returns The first matching process, or null if not found / native unavailable.
 */
export function findGameProcess(candidates: string[] = GAME_PROCESS_NAMES): GameProcess | null {
  const processes = listProcesses()
  if (processes.length === 0) return null

  const lower = candidates.map(n => n.toLowerCase())

  for (const proc of processes) {
    if (lower.includes(proc.szExeFile.toLowerCase())) {
      return { pid: proc.th32ProcessID, name: proc.szExeFile }
    }
  }

  return null
}
