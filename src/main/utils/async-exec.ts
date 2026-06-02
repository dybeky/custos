import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../services/logger'

const execFilePromise = promisify(execFile)

// Global process concurrency limiter to prevent spawning too many cmd.exe/powershell
const MAX_CONCURRENT_PROCESSES = 5
let activeProcesses = 0
const waitQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeProcesses < MAX_CONCURRENT_PROCESSES) {
    activeProcesses++
    return Promise.resolve()
  }
  return new Promise<void>(resolve => waitQueue.push(resolve))
}

function releaseSlot(): void {
  const next = waitQueue.shift()
  if (next) {
    next() // pass slot to next waiter, don't decrement
  } else {
    activeProcesses--
  }
}

export interface AsyncExecOptions {
  timeout?: number
  maxBuffer?: number
  /** If true, rejects on command errors instead of resolving with empty string (default: false) */
  throwOnError?: boolean
}

/** Check if command starts with powershell (already outputs UTF-8 JSON or ASCII-only) */
function isPowerShellCommand(command: string): boolean {
  return command.trimStart().toLowerCase().startsWith('powershell')
}

/** Classifies exec errors for better logging */
function classifyError(error: Error & { code?: string | number; killed?: boolean; signal?: string }): string {
  if (error.killed || error.signal === 'SIGKILL') return 'timeout'
  const msg = error.message.toLowerCase()
  if (msg.includes('access is denied') || msg.includes('eacces')) return 'access_denied'
  if (msg.includes('is not recognized') || msg.includes('not found') || msg.includes('enoent')) return 'command_not_found'
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'buffer_overflow'
  return 'unknown'
}

/**
 * Simple async exec without process limiter - just run and timeout
 */
export async function asyncExec(
  command: string,
  options?: AsyncExecOptions
): Promise<string> {
  const timeout = options?.timeout || 10000
  const maxBuffer = options?.maxBuffer || 5 * 1024 * 1024
  const throwOnError = options?.throwOnError ?? false

  await acquireSlot()

  // Force UTF-8 code page for cmd.exe commands to prevent mojibake on non-English Windows.
  // PowerShell commands that use ConvertTo-Json already produce ASCII-safe JSON output.
  const finalCommand = isPowerShellCommand(command)
    ? command
    : `chcp 65001 >nul && ${command}`

  return new Promise((resolve, reject) => {
    const proc = exec(finalCommand, {
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer,
      timeout,
      killSignal: 'SIGKILL'
    }, (error, stdout) => {
      releaseSlot()
      if (error) {
        const errorType = classifyError(error as Error & { code?: string | number; killed?: boolean; signal?: string })
        logger.debug('asyncExec command error', {
          command: command.substring(0, 100),
          error: error.message,
          type: errorType
        })
        if (throwOnError) {
          reject(new Error(`Command failed (${errorType}): ${error.message}`))
          return
        }
      }
      resolve(stdout || '')
    })

    // Extra safety: force kill after timeout + 1s
    const killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        // Ignore
      }
    }, timeout + 1000)

    proc.on('close', () => {
      clearTimeout(killTimer)
    })
  })
}

/**
 * Async execFile (no shell) — safe for reg.exe queries.
 * Does NOT throw when `reg query` returns a non-zero exit code due to a missing
 * registry key (mirrors the `2>nul` behaviour of the old shell-based exec calls).
 */
export async function execFileAsync(
  file: string,
  args: string[],
  opts?: { timeoutMs?: number }
): Promise<{ stdout: string; stderr: string }> {
  await acquireSlot()
  try {
    const result = await execFilePromise(file, args, {
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64, // 64 MB
      timeout: opts?.timeoutMs ?? 15000,
      killSignal: 'SIGKILL'
    })
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  } catch (error) {
    // execFile rejects when the process exits with a non-zero code.
    // For `reg query`, a non-zero exit means "key not found" — not a hard error.
    // Return whatever stdout/stderr the process produced so callers can still parse.
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number | string }
    logger.debug('execFileAsync non-zero exit', { file, code: execError.code, stderr: execError.stderr?.substring(0, 200) })
    return { stdout: execError.stdout ?? '', stderr: execError.stderr ?? '' }
  } finally {
    releaseSlot()
  }
}
