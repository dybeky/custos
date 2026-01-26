import { exec } from 'child_process'
import { promisify } from 'util'

const execPromise = promisify(exec)

export interface AsyncExecOptions {
  timeout?: number
  maxBuffer?: number
}

export async function asyncExec(
  command: string,
  options?: AsyncExecOptions
): Promise<string> {
  const { stdout } = await execPromise(command, {
    encoding: 'utf-8',
    maxBuffer: options?.maxBuffer || 10 * 1024 * 1024,
    timeout: options?.timeout || 30000,
    windowsHide: true
  })
  return stdout
}

// Run multiple commands in parallel with concurrency limit
export async function asyncExecParallel<T>(
  items: T[],
  executor: (item: T) => Promise<string>,
  concurrency: number
): Promise<string[]> {
  const results: string[] = []
  const executing: Promise<void>[] = []

  for (const item of items) {
    const p = executor(item).then(result => {
      results.push(result)
    }).catch(() => {
      results.push('')
    })

    executing.push(p)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        if (executing[i] !== p) {
          executing.splice(i, 1)
        }
      }
    }
  }

  await Promise.all(executing)
  return results
}
