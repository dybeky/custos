import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Where Windows' own tools live, so Custos runs the real ones.
 *
 * A bare name like `reg` or `tasklist` is looked up in the CURRENT folder
 * before PATH — by libuv for execFile/spawn and by cmd.exe for exec. Custos
 * is usually started from the folder it was downloaded to, which the checked
 * player controls: a planted `tasklist.exe` next to it would run elevated and
 * could feed every scanner a clean answer. Each child process therefore gets
 * System32 as its working folder (so that search finds the genuine tool first)
 * and, where the tool is not in System32 itself, an absolute path.
 */

/** The Windows folder (C:\Windows on a default install). */
export function systemRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.SystemRoot || env.windir || 'C:\\Windows'
}

/** %SystemRoot%\System32. */
export function system32Dir(env: NodeJS.ProcessEnv = process.env): string {
  return join(systemRoot(env), 'System32')
}

/** Working folder for child processes: System32 on Windows, inherited elsewhere. */
export function systemCwd(): string | undefined {
  return process.platform === 'win32' ? system32Dir() : undefined
}

/** Windows PowerShell 5.1 — not in System32 itself, so never found through the working folder. */
export function powershellPath(): string {
  return join(system32Dir(), 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** The real cmd.exe (%ComSpec% is an environment variable anyone can repoint). */
export function cmdPath(): string {
  return join(system32Dir(), 'cmd.exe')
}

/**
 * Absolute path of a bare Windows tool name ("reg", "tasklist.exe",
 * "powershell"). Names that already carry a folder, tools that are not in
 * System32, and every name off Windows are returned unchanged.
 */
export function resolveSystemTool(file: string): string {
  if (process.platform !== 'win32' || /[\\/]/.test(file)) return file
  if (/^powershell(\.exe)?$/i.test(file)) return powershellPath()
  const exe = /\.exe$/i.test(file) ? file : `${file}.exe`
  const path = join(system32Dir(), exe)
  return existsSync(path) ? path : file
}

/**
 * A shell command line with a leading bare `powershell` replaced by the
 * quoted absolute path (cmd.exe would otherwise search PATH for it).
 */
export function withSystemPowershell(command: string): string {
  if (process.platform !== 'win32') return command
  return command.replace(/^\s*powershell(\.exe)?(?=\s|$)/i, `"${powershellPath()}"`)
}
