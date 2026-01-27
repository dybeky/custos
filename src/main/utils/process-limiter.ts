/**
 * Global process limiter to prevent spawning too many concurrent processes.
 * This helps prevent system freezes when multiple scanners run in parallel.
 */
class ProcessLimiter {
  private running = 0
  private queue: (() => void)[] = []

  constructor(private maxConcurrent = 15) {}

  /**
   * Acquire a slot for running a process.
   * If all slots are taken, this will wait until one becomes available.
   */
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++
      return
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  /**
   * Release a slot after a process completes.
   * This will allow the next queued process to run.
   */
  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }

  /**
   * Get the current number of running processes.
   */
  getRunning(): number {
    return this.running
  }

  /**
   * Get the number of processes waiting in the queue.
   */
  getQueueLength(): number {
    return this.queue.length
  }
}

// Global singleton instance with max 15 concurrent processes
export const globalProcessLimiter = new ProcessLimiter(15)
