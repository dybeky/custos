import { exec } from 'child_process'
import { logger } from '../services/logger'

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
      // Log errors for debugging but still resolve to avoid breaking scanners
      if (error) {
        logger.debug('asyncExec command error', {
          command: command.substring(0, 100),
          error: error.message
        })
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

