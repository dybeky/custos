// src/main/utils/arch-utils.ts
import { execFileSync } from 'child_process'
import { logger } from '../services/logger'

/** Normalized CPU architecture identifiers used across the app. */
export type CpuArch = 'x64' | 'arm64' | 'ia32' | 'unknown'

export interface ArchInfo {
  /** Architecture this binary was built for (process.arch). */
  appArch: CpuArch
  /** Real architecture of the OS, even when the app runs under emulation. */
  osArch: CpuArch
  /** True when appArch !== osArch (e.g. the x64 build on a Windows-on-ARM PC). */
  isEmulated: boolean
}

/** Map Windows arch identifiers (AMD64/ARM64/x86) and Node arch names to CpuArch. */
export function normalizeWindowsArch(raw: string | undefined): CpuArch {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'AMD64':
    case 'X64':
      return 'x64'
    case 'ARM64':
      return 'arm64'
    case 'X86':
    case 'IA32':
      return 'ia32'
    default:
      return 'unknown'
  }
}

/** Extract PROCESSOR_ARCHITECTURE from `reg query` output. */
export function parseRegArchOutput(stdout: string): CpuArch {
  const m = stdout.match(/PROCESSOR_ARCHITECTURE\s+REG_\w+\s+(\S+)/i)
  return m ? normalizeWindowsArch(m[1]) : 'unknown'
}

/**
 * Pure resolution of app/OS architecture. Detection order for the OS arch on
 * Windows: machine-wide registry value (immune to per-process emulation lies),
 * then PROCESSOR_ARCHITEW6432 (set inside emulated processes), then the app's
 * own arch. Non-Windows never reports emulation.
 */
export function resolveArchInfo(input: {
  appArch: string
  platform: string
  envArchW6432: string | undefined
  registryArch: CpuArch
}): ArchInfo {
  const appArch = normalizeWindowsArch(input.appArch)

  if (input.platform !== 'win32') {
    return { appArch, osArch: appArch, isEmulated: false }
  }

  let osArch: CpuArch = 'unknown'
  if (input.registryArch !== 'unknown') {
    osArch = input.registryArch
  } else if (input.envArchW6432) {
    osArch = normalizeWindowsArch(input.envArchW6432)
  }
  if (osArch === 'unknown') osArch = appArch

  return { appArch, osArch, isEmulated: appArch !== osArch }
}

let cachedArchInfo: ArchInfo | null = null

/** Read the machine-wide PROCESSOR_ARCHITECTURE from the registry (Windows only). */
function queryRegistryArch(): CpuArch {
  try {
    const out = execFileSync(
      'reg',
      [
        'query',
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
        '/v',
        'PROCESSOR_ARCHITECTURE'
      ],
      { encoding: 'utf8', timeout: 3000, windowsHide: true }
    )
    return parseRegArchOutput(out)
  } catch (err) {
    logger.debug('Registry arch query failed; falling back to environment', {
      error: err instanceof Error ? err.message : String(err)
    })
    return 'unknown'
  }
}

/**
 * App + OS architecture, detected once and cached. Safe to call from sync
 * code paths (single short reg.exe query on first Windows call).
 */
export function getArchInfo(): ArchInfo {
  if (cachedArchInfo) return cachedArchInfo
  cachedArchInfo = resolveArchInfo({
    appArch: process.arch,
    platform: process.platform,
    envArchW6432: process.env.PROCESSOR_ARCHITEW6432,
    registryArch: process.platform === 'win32' ? queryRegistryArch() : 'unknown'
  })
  return cachedArchInfo
}
