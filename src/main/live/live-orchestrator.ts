/**
 * Live-scan orchestrator.
 *
 * Mirrors the forensic scan-orchestrator pattern: each detector runs with
 * per-detector try/catch, progress and result events are streamed over IPC,
 * and the process handle is always closed in a finally block.
 *
 * Flow:
 *   1. Check native availability — emit status finding if unavailable.
 *   2. Locate the game process — emit status finding if not running.
 *   3. Open process handle.
 *   4. Run enabled detectors sequentially, emitting progress + findings.
 *   5. Close handle.
 *   6. Emit LIVE_SCAN_COMPLETE.
 */

import { IPC_CHANNELS, LiveFinding, LiveContext } from '../../shared/types'
import { isMemoryNativeAvailable, openGameProcess, close } from './native/memory'
import { findGameProcess } from './process-locator'
import { loadSignatures } from './signatures'
import { aobDetector } from './detectors/aob-detector'
import { injectedModuleDetector } from './detectors/injected-module-detector'
import { monoDetector } from './detectors/mono-detector'
import { selfIntegrityDetector } from './detectors/self-integrity-detector'
import { threadDetector } from './detectors/thread-detector'

export interface LiveScanOptions {
  /** IPC emit function — wraps safeSend(channel, payload) */
  emit: (channel: string, payload: unknown) => void
  /** AbortSignal for cancellation (respected between detectors) */
  signal: AbortSignal
  /** Override process name list passed to findGameProcess (optional). */
  processNames?: string[]
}

// Detectors enabled in phase 1 + phase 7 (in run order)
const DETECTORS = [aobDetector, injectedModuleDetector, monoDetector, threadDetector, selfIntegrityDetector]

function makeStatusFinding(title: string, detail: string): LiveFinding {
  return {
    detectorId: 'orchestrator',
    detectorName: 'Live Scan',
    title,
    detail,
    confidence: 'info'
  }
}

export async function runLiveScan(opts: LiveScanOptions): Promise<LiveFinding[]> {
  const { emit, signal } = opts
  const allFindings: LiveFinding[] = []

  // ── 1. Native availability ────────────────────────────────────────────────
  if (!isMemoryNativeAvailable()) {
    const f = makeStatusFinding(
      'Native module unavailable (Windows only)',
      'Live memory scanning requires the memoryjs native addon, which is only ' +
      'available on Windows. Run Custos on a Windows machine to use this feature.'
    )
    allFindings.push(f)
    emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
    emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
    return allFindings
  }

  // ── 2. Locate game process ────────────────────────────────────────────────
  const game = findGameProcess(opts.processNames)
  if (!game) {
    const f = makeStatusFinding(
      'Unturned not running — start it and rescan',
      'The live scanner could not find a running Unturned process. ' +
      'Launch Unturned and click "Live Scan" again.'
    )
    allFindings.push(f)
    emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
    emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
    return allFindings
  }

  // ── 3. Open process handle ────────────────────────────────────────────────
  const proc = openGameProcess(game.pid)
  if (!proc) {
    const f = makeStatusFinding(
      'Failed to open game process',
      `Could not open a handle to ${game.name} (PID ${game.pid}). ` +
      'Ensure Custos is running as Administrator.'
    )
    allFindings.push(f)
    emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
    emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
    return allFindings
  }

  const signatures = loadSignatures()
  const ctx: LiveContext = {
    pid: game.pid,
    handle: proc.handle,
    gameName: game.name,
    signatures
  }

  // ── 4. Run detectors ──────────────────────────────────────────────────────
  try {
    for (let i = 0; i < DETECTORS.length; i++) {
      if (signal.aborted) break

      const detector = DETECTORS[i]

      emit(IPC_CHANNELS.LIVE_SCAN_PROGRESS, {
        detectorId: detector.id,
        detectorName: detector.name,
        current: i + 1,
        total: DETECTORS.length,
        percentage: (i / DETECTORS.length) * 100
      })

      let detectorFindings: LiveFinding[] = []
      try {
        detectorFindings = await detector.run(ctx)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        detectorFindings = [{
          detectorId: detector.id,
          detectorName: detector.name,
          title: `Detector error: ${detector.name}`,
          detail: errMsg,
          confidence: 'info'
        }]
      }

      for (const f of detectorFindings) {
        allFindings.push(f)
        emit(IPC_CHANNELS.LIVE_SCAN_RESULT, f)
      }
    }
  } finally {
    // ── 5. Close handle (always) ──────────────────────────────────────────
    close(proc.handle)
  }

  // ── 6. Complete ──────────────────────────────────────────────────────────
  emit(IPC_CHANNELS.LIVE_SCAN_COMPLETE, allFindings)
  return allFindings
}
