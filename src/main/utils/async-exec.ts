import { spawn } from 'child_process'
import { globalProcessLimiter } from './process-limiter'

export interface AsyncExecOptions {
  timeout?: number
  maxBuffer?: number
}

export async function asyncExec(
  command: string,
  options?: AsyncExecOptions
): Promise<string> {
  const timeout = options?.timeout || 30000
  const maxBuffer = options?.maxBuffer || 10 * 1024 * 1024

  await globalProcessLimiter.acquire()

  try {
    return await executeCommand(command, timeout, maxBuffer)
  } finally {
    globalProcessLimiter.release()
  }
}

async function executeCommand(
  command: string,
  timeout: number,
  maxBuffer: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let killed = false
    let bufferWarned = false

    // Use cmd.exe on Windows to run the command
    const proc = spawn('cmd.exe', ['/c', command], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    // Cleanup function to remove all event listeners
    const cleanup = () => {
      proc.stdout?.removeAllListeners()
      proc.stderr?.removeAllListeners()
      proc.removeAllListeners()
    }

    // Timeout handler - kill process tree and wait for it
    const timer = setTimeout(async () => {
      killed = true
      try {
        // Kill process tree on Windows and wait for taskkill to complete
        await new Promise<void>((resolveKill) => {
          const killer = spawn('taskkill', ['/pid', proc.pid!.toString(), '/f', '/t'], {
            windowsHide: true,
            stdio: 'ignore'
          })
          killer.on('close', () => resolveKill())
          killer.on('error', () => resolveKill())
          // Fallback timeout in case taskkill hangs
          setTimeout(() => resolveKill(), 2000)
        })
      } catch {
        proc.kill('SIGKILL')
      }
      cleanup()
      reject(new Error(`Timeout after ${timeout}ms: ${command.substring(0, 100)}...`))
    }, timeout)

    proc.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < maxBuffer) {
        stdout += data.toString('utf-8')
      } else if (!bufferWarned) {
        bufferWarned = true
        console.warn(`[asyncExec] Buffer limit reached: ${command.substring(0, 50)}...`)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      // Capture stderr for diagnostics (limited to 10KB)
      if (stderr.length < 10000) {
        stderr += data.toString('utf-8')
      }
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      cleanup()
      if (killed) return
      if (code === 0 || stdout.length > 0) {
        resolve(stdout)
      } else {
        // Include stderr in error message for better diagnostics
        const errMsg = stderr.trim()
          ? `Process exited with code ${code}: ${stderr.substring(0, 200)}`
          : `Process exited with code ${code}`
        reject(new Error(errMsg))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      cleanup()
      if (!killed) {
        reject(err)
      }
    })
  })
}

// Run multiple commands in parallel with concurrency limit
export async function asyncExecParallel<T>(
  items: T[],
  executor: (item: T) => Promise<string>,
  concurrency: number
): Promise<string[]> {
  const results: string[] = new Array(items.length).fill('')
  const executing: Map<number, Promise<void>> = new Map()

  for (let i = 0; i < items.length; i++) {
    const index = i
    const p = executor(items[i])
      .then(result => { results[index] = result })
      .catch(() => { results[index] = '' })
      .finally(() => { executing.delete(index) })

    executing.set(index, p)

    if (executing.size >= concurrency) {
      await Promise.race(executing.values())
    }
  }

  await Promise.all(executing.values())
  return results
}
