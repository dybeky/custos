import { execFileSync } from 'child_process'

/**
 * Read a process's command line by PID via PowerShell CIM.
 * Returns '' on non-Windows, failure, or empty result (never throws).
 */
export function getProcessCommandLine(pid: number): string {
  if (process.platform !== 'win32') return ''
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    )
    return out.trim()
  } catch {
    return ''
  }
}
