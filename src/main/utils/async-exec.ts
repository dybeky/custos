import { exec } from 'child_process'

export interface AsyncExecOptions {
  timeout?: number
  maxBuffer?: number
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

  return new Promise((resolve) => {
    const proc = exec(command, {
      windowsHide: true,
      maxBuffer,
      timeout,
      killSignal: 'SIGKILL'
    }, (error, stdout) => {
      // Always resolve (even on error) - just return what we got
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

