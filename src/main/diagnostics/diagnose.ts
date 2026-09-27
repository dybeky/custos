/**
 * Turn a startup failure or crash into a plain-language diagnosis.
 *
 * Rule: only name a cause (and offer a download) when the evidence is
 * unambiguous — a specific error code or message that has exactly one fix.
 * Anything else is reported as "unexpected" with the raw error, never a guess.
 * Pure: no Electron imports, so every rule is unit-tested.
 */

import type { Diagnosis } from '../../shared/types'
export type { Diagnosis, DiagnosisId } from '../../shared/types'

/** Official download pages only. */
export const FIX_URLS = {
  vcredist: 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist',
  releases: 'https://github.com/dybeky/custos/releases/latest',
  nvidia: 'https://www.nvidia.com/en-us/drivers/',
  amd: 'https://www.amd.com/en/support/download/drivers.html',
  intel: 'https://www.intel.com/content/www/us/en/support/detect.html'
} as const

const RELEASES_FIX = { label: 'Download the latest Custos', url: FIX_URLS.releases }

interface ErrorLike {
  message: string
  code?: string
}

function toErrorLike(err: unknown): ErrorLike {
  if (err instanceof Error) return { message: err.message ?? '', code: (err as { code?: string }).code }
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: unknown; code?: unknown }
    return { message: String(e.message ?? ''), code: typeof e.code === 'string' ? e.code : undefined }
  }
  return { message: String(err ?? '') }
}

/** Diagnose an exception (uncaught in main, or a native addon failing to load). */
export function diagnoseError(err: unknown): Diagnosis {
  const { message, code } = toErrorLike(err)
  const msg = message.toLowerCase()
  const isNativeLoad = code === 'ERR_DLOPEN_FAILED' || /\.node\b/i.test(message)

  // A native addon needs the Microsoft Visual C++ runtime. Windows names the
  // missing DLL, or says "module could not be found" for the addon's import.
  if (/\b(vcruntime140(_1)?|msvcp140(_1|_2)?|concrt140)\.dll\b/i.test(message) ||
      (isNativeLoad && msg.includes('the specified module could not be found'))) {
    return {
      id: 'vcredist-missing',
      title: 'Microsoft Visual C++ Redistributable is missing',
      detail:
        'A component Custos needs could not load because the Microsoft Visual C++ runtime is not installed ' +
        '(or is damaged). Install the latest "Visual C++ Redistributable" for your system (x64, or ARM64 on ' +
        'Snapdragon PCs), then start Custos again.',
      fix: { label: 'Open Microsoft download page', url: FIX_URLS.vcredist }
    }
  }

  // Addon built for a different Electron/Node ABI → the files do not belong together.
  if (isNativeLoad && (msg.includes('node_module_version') || msg.includes('compiled against a different node.js version'))) {
    return {
      id: 'native-abi-mismatch',
      title: 'This copy of Custos is mismatched',
      detail: 'A built-in component was compiled for a different version of the app. Download the latest release again.',
      fix: RELEASES_FIX
    }
  }

  // ERROR_BAD_EXE_FORMAT (193): a binary for another CPU architecture.
  if (msg.includes('is not a valid win32 application') || /\berror 193\b/.test(msg)) {
    return {
      id: 'wrong-architecture',
      title: 'Wrong build for this processor',
      detail:
        'Part of Custos was built for a different processor type. Use custos-x64.exe on regular Intel/AMD PCs ' +
        'and custos-arm64.exe on Windows-on-ARM devices.',
      fix: RELEASES_FIX
    }
  }

  if (code === 'ENOSPC' || msg.includes('no space left on device') || msg.includes('not enough space on the disk')) {
    return {
      id: 'disk-full',
      title: 'The disk is full',
      detail: 'Custos could not write to disk because it is full. Free some space on the system drive and start Custos again.'
    }
  }

  if (code === 'EPERM' || code === 'EACCES' || msg.includes('access is denied')) {
    return {
      id: 'access-denied',
      title: 'Access was denied',
      detail:
        'Windows blocked Custos from reading or writing a file it needs. Run Custos as Administrator, and if an ' +
        'antivirus quarantined it, restore the file and allow Custos. Details: ' + message
    }
  }

  return unexpected(message)
}

export interface ProcessGoneDetails {
  /** 'GPU', 'Utility', … for child-process-gone; undefined for the renderer. */
  type?: string
  reason: string
  exitCode?: number
}

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | null

/** PCI vendor id → GPU vendor, from app.getGPUInfo('basic'). */
export function gpuVendorFromId(vendorId: number | undefined): GpuVendor {
  if (vendorId === 0x10de) return 'nvidia'
  if (vendorId === 0x1002 || vendorId === 0x1022) return 'amd'
  if (vendorId === 0x8086) return 'intel'
  return null
}

const DRIVER_FIX: Record<Exclude<GpuVendor, null>, Diagnosis['fix']> = {
  nvidia: { label: 'Open NVIDIA driver downloads', url: FIX_URLS.nvidia },
  amd: { label: 'Open AMD driver downloads', url: FIX_URLS.amd },
  intel: { label: 'Open Intel driver assistant', url: FIX_URLS.intel }
}

/** Diagnose a renderer or child process (GPU, …) that died. Null = not worth a dialog. */
export function diagnoseProcessGone(details: ProcessGoneDetails, gpuVendor: GpuVendor = null): Diagnosis | null {
  const { type, reason } = details
  if (reason === 'clean-exit' || reason === 'killed') return null // normal shutdown / killed by us or the user

  if (type === 'GPU' && (reason === 'crashed' || reason === 'launch-failed' || reason === 'abnormal-exit')) {
    return {
      id: 'gpu-crash',
      title: 'The graphics driver crashed',
      detail:
        'Custos will restart with hardware acceleration turned off, which works on any graphics card. ' +
        'Updating your graphics driver usually fixes this for good.',
      fix: gpuVendor ? DRIVER_FIX[gpuVendor] : undefined
    }
  }
  if (type !== undefined) return null // other utility processes restart on their own

  if (reason === 'oom') {
    return {
      id: 'out-of-memory',
      title: 'Custos ran out of memory',
      detail: 'Windows ran out of memory for the Custos window. Close other heavy programs and reload.'
    }
  }
  if (reason === 'crashed' || reason === 'abnormal-exit' || reason === 'launch-failed' || reason === 'integrity-failure') {
    return {
      id: 'renderer-crash',
      title: 'The Custos window crashed',
      detail:
        reason === 'launch-failed' || reason === 'integrity-failure'
          ? 'The window process could not start. An antivirus may be blocking it — allow Custos, or download a fresh copy.'
          : 'The window stopped unexpectedly. Reload to continue; if it keeps happening, download the latest release.',
      fix: reason === 'integrity-failure' ? RELEASES_FIX : undefined
    }
  }
  return null
}

/** The bundled page failed to load: missing/corrupt files → a broken download. */
export function diagnoseLoadFailure(errorCode: number, errorDescription: string): Diagnosis | null {
  // -6 ERR_FILE_NOT_FOUND, -2 ERR_FAILED on file://, -300s are URL/format errors.
  if (errorCode === -3) return null // ERR_ABORTED: a navigation was superseded, not a failure
  if (errorCode === -6 || errorCode === -2 || (errorCode <= -300 && errorCode > -400)) {
    return {
      id: 'damaged-install',
      title: 'Custos files are missing or damaged',
      detail: `The app window could not load (${errorDescription || errorCode}). The download may be incomplete or an antivirus removed a file. Download a fresh copy.`,
      fix: RELEASES_FIX
    }
  }
  return null
}

function unexpected(message: string): Diagnosis {
  return {
    id: 'unexpected',
    title: 'Custos hit an unexpected error',
    detail: `The error was: ${message || 'unknown'}. The log file has the full details — please include it if you report this.`
  }
}
