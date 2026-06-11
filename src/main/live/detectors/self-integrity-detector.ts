/**
 * Detector #8 — Self-integrity check.
 *
 * Checks whether the Custos main process itself is being debugged. A cheat
 * operator or analyst may attach a debugger to Custos to understand its
 * detection logic or disable it.
 *
 * Covered here:
 *   - IsDebuggerPresent (fast kernel flag)
 *   - CheckRemoteDebuggerPresent (catches cross-process / kernel debuggers)
 *
 * VM detection is covered by the forensic vm-scanner (already shipped).
 * Patch / suspend detection is a documented TODO for a later phase.
 *
 * On non-Windows the functions in winapi.ts return false, so this detector
 * will produce no findings — which is the correct safe-default behaviour.
 */

import { isDebuggerPresentSelf, checkRemoteDebugger } from '../native/winapi'
import type { LiveContext, LiveFinding } from '../../../shared/types'

export const selfIntegrityDetector = {
  id: 'self-integrity',
  name: 'Self-Integrity Check',

  async run(_ctx: LiveContext): Promise<LiveFinding[]> {
    const findings: LiveFinding[] = []

    // ── IsDebuggerPresent ────────────────────────────────────────────────────
    if (isDebuggerPresentSelf()) {
      findings.push({
        detectorId: 'self-integrity',
        detectorName: 'Self-Integrity Check',
        title: 'Debugger detected (IsDebuggerPresent)',
        detail:
          'A debugger is attached to the Custos process. This may indicate an attempt to analyse or tamper with the scanner.',
        confidence: 'high',
        i18nKey: 'debuggerPresent'
      })
    }

    // ── CheckRemoteDebuggerPresent ───────────────────────────────────────────
    if (checkRemoteDebugger()) {
      findings.push({
        detectorId: 'self-integrity',
        detectorName: 'Self-Integrity Check',
        title: 'Remote debugger detected (CheckRemoteDebuggerPresent)',
        detail:
          'CheckRemoteDebuggerPresent returned true for the Custos process. A kernel-level or cross-process debugger may be attached.',
        confidence: 'high',
        i18nKey: 'remoteDebugger'
      })
    }

    return findings
  }
}
