import { exec, execFile, spawn } from 'child_process'
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

/** Check if command starts with powershell (no `chcp` prefix; its output is decoded instead) */
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
 * Run a command through the shell (cmd.exe), UTF-8 forced, with a timeout and a
 * global concurrency cap.
 *
 * SECURITY: this uses `exec`, which spawns a shell and interprets metacharacters
 * (`&&`, `|`, `>`, `2>nul`, …). The shell is required for the `chcp 65001` prefix
 * and the `2>nul` redirects callers rely on. ONLY pass hardcoded command strings.
 * NEVER interpolate user-, file-, registry-, or network-derived values into the
 * `command` argument — use `execFileAsync` (no shell, argv array) for anything
 * involving dynamic input.
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
  // PowerShell output is decoded from the OEM code page when it is not UTF-8.
  const finalCommand = isPowerShellCommand(command)
    ? command
    : `chcp 65001 >nul && ${command}`

  return new Promise((resolve, reject) => {
    const proc = exec(finalCommand, {
      windowsHide: true,
      // Decoded below: PowerShell writes in the console's OEM code page, which
      // is not UTF-8 on e.g. Russian Windows.
      encoding: 'buffer',
      maxBuffer,
      timeout,
      killSignal: 'SIGKILL'
    }, (error, stdoutBytes) => {
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
      decodeOutput(Buffer.isBuffer(stdoutBytes) ? stdoutBytes : Buffer.from(stdoutBytes ?? '')).then(resolve, () => resolve(''))
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
/**
 * Spawn-based exec that feeds `input` to the child process via STDIN.
 * Always resolves (never rejects) with whatever stdout/stderr was produced,
 * mirroring the lenient behaviour of execFileAsync's non-input path.
 */
function execFileWithInput(
  file: string, args: string[], input: string, timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(file, args, { windowsHide: true })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const finish = (): void => {
      clearTimeout(timer)
      void Promise.all([decodeOutput(Buffer.concat(out)), decodeOutput(Buffer.concat(err))])
        .then(([stdout, stderr]) => resolve({ stdout, stderr }))
    }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL') } catch { /* ignore */ } }, timeoutMs)
    proc.stdout.on('data', (d: Buffer) => { out.push(d) })
    proc.stderr.on('data', (d: Buffer) => { err.push(d) })
    proc.on('close', finish)
    proc.on('error', finish)
    proc.stdin.on('error', () => { /* ignore EPIPE if process never started */ })
    try { proc.stdin.end(input) } catch { /* ignore */ }
  })
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true })
let oemDecoder: Promise<TextDecoder> | null = null

/**
 * Decoder for the console's OEM code page. Windows tools (reg.exe, tasklist,
 * wevtutil) write in it when their output is piped — CP866 on Russian Windows —
 * so a path like C:\Users\Иван\… is not UTF-8.
 */
function oem(): Promise<TextDecoder> {
  oemDecoder ??= execFilePromise(
    'reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage', '/v', 'OEMCP'],
    { windowsHide: true, timeout: 5000 }
  ).then(({ stdout }) => oemDecoderFor(/OEMCP\s+REG_SZ\s+(\d+)/.exec(stdout)?.[1] ?? ''))
    .catch(() => oemDecoderFor(''))
  return oemDecoder
}

/** TextDecoder for an OEM code page number; latin1 when the page has no WHATWG decoder. */
export function oemDecoderFor(codePage: string): TextDecoder {
  const label = codePage === '866' ? 'ibm866' : codePage === '65001' ? 'utf-8' : 'latin1'
  try {
    return new TextDecoder(label)
  } catch {
    return new TextDecoder('latin1') // runtime without legacy encodings
  }
}

/** UTF-8 when the bytes are valid UTF-8 (all ASCII output included), else the OEM code page. */
export async function decodeOutput(bytes: Buffer, decoder?: TextDecoder): Promise<string> {
  if (bytes.length === 0) return ''
  try {
    return utf8Strict.decode(bytes)
  } catch {
    return (decoder ?? (await oem())).decode(bytes)
  }
}

export async function execFileAsync(
  file: string,
  args: string[],
  opts?: { timeoutMs?: number; input?: string }
): Promise<{ stdout: string; stderr: string }> {
  await acquireSlot()
  try {
    if (opts?.input !== undefined) {
      return await execFileWithInput(file, args, opts.input, opts.timeoutMs ?? 15000)
    }
    const result = await execFilePromise(file, args, {
      windowsHide: true,
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 64, // 64 MB
      timeout: opts?.timeoutMs ?? 15000,
      killSignal: 'SIGKILL'
    })
    return { stdout: await decodeOutput(result.stdout), stderr: await decodeOutput(result.stderr) }
  } catch (error) {
    // execFile rejects when the process exits with a non-zero code.
    // For `reg query`, a non-zero exit means "key not found" — not a hard error.
    // Return whatever stdout/stderr the process produced so callers can still parse.
    const execError = error as Error & { stdout?: Buffer; stderr?: Buffer; code?: number | string }
    const stdout = execError.stdout ? await decodeOutput(execError.stdout) : ''
    const stderr = execError.stderr ? await decodeOutput(execError.stderr) : ''
    logger.debug('execFileAsync non-zero exit', { file, code: execError.code, stderr: stderr.substring(0, 200) })
    return { stdout, stderr }
  } finally {
    releaseSlot()
  }
}
