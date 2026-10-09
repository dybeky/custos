import { execFileAsync } from '../../utils/async-exec'

/**
 * Read a process's command line by PID via PowerShell CIM.
 * Returns '' on non-Windows, failure, or empty result (never throws).
 * Async: PowerShell takes seconds to start, and a sync call would freeze the
 * whole app window for that long.
 */
export async function getProcessCommandLine(pid: number): Promise<string> {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return ''
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { timeoutMs: 5000 }
    )
    return stdout.trim()
  } catch {
    return ''
  }
}
