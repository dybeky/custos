/**
 * IPC handlers for the live-memory scan subsystem.
 *
 * Called from setupIpcHandlers() in ipc-handlers.ts. Follows the same
 * safeSend / abort-controller patterns as the forensic scan handlers.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, LiveScanStatus, LiveFinding } from '../shared/types'
import { GAMES, type GameId } from '../shared/games'
import { logger } from './services/logger'
import { isMemoryNativeAvailable, getMemoryNativeLoadError } from './live/native/memory'
import { diagnoseError } from './diagnostics/diagnose'
import { findGameProcess } from './live/process-locator'
import { runLiveScan } from './live/live-orchestrator'

let isLiveScanning = false
let liveAbortController: AbortController | null = null

export function setupLiveIpcHandlers(mainWindow: BrowserWindow): void {
  const safeSend = (channel: string, data: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // ── live:get-status ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.LIVE_GET_STATUS, (_e, gameId?: GameId): LiveScanStatus => {
    if (gameId !== undefined && !(gameId in GAMES)) {
      throw new Error(`Invalid game ID: ${String(gameId)}`)
    }
    const names = gameId ? GAMES[gameId].processNames : undefined
    const nativeAvailable = isMemoryNativeAvailable()
    const game = nativeAvailable ? findGameProcess(names) : null
    // Only surface a recognised cause (e.g. missing VC++ runtime) — an
    // unrecognised one keeps the generic "native unavailable" banner.
    const loadError = nativeAvailable ? null : getMemoryNativeLoadError()
    const diagnosis = loadError ? diagnoseError(loadError) : null
    return {
      nativeAvailable,
      ...(diagnosis && diagnosis.id !== 'unexpected' ? { nativeDiagnosis: diagnosis } : {}),
      platform: process.platform,
      arch: process.arch,
      gameRunning: game !== null,
      gameName: game?.name
    }
  })

  // ── live:scan:start ──────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.LIVE_SCAN_START, async (_e, gameId?: GameId): Promise<LiveFinding[]> => {
    if (gameId !== undefined && !(gameId in GAMES)) {
      throw new Error(`Invalid game ID: ${String(gameId)}`)
    }
    if (isLiveScanning) {
      logger.warn('Live scan already in progress')
      throw new Error('Live scan already in progress')
    }

    logger.info('Live scan started')
    isLiveScanning = true
    liveAbortController = new AbortController()

    try {
      const names = gameId ? GAMES[gameId].processNames : undefined
      const results = await runLiveScan({
        emit: safeSend,
        signal: liveAbortController.signal,
        processNames: names
      })

      const highCount = results.filter(f => f.confidence === 'high').length
      logger.info('Live scan completed', {
        total: results.length,
        high: highCount,
        suspicious: results.filter(f => f.confidence === 'suspicious').length
      })

      return results
    } catch (error) {
      logger.error('Live scan failed', error instanceof Error ? error : new Error(String(error)))
      throw error
    } finally {
      isLiveScanning = false
      liveAbortController = null
    }
  })

  // ── live:scan:cancel ─────────────────────────────────────────────────────
  // Cooperative: the orchestrator stops before the next detector and still
  // closes the process handle. No-op when no live scan is running.
  ipcMain.handle(IPC_CHANNELS.LIVE_SCAN_CANCEL, (): void => {
    liveAbortController?.abort()
  })
}
