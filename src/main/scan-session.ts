/**
 * Owns the lifecycle of the single in-flight scan: the "in progress" flag and
 * its AbortController, kept together so they cannot drift out of sync.
 *
 * The critical invariant is that cancellation does NOT end the session. A scan
 * is cooperative — after abort, its already-started scanners keep unwinding for
 * up to the per-scanner timeout. The session therefore stays "in progress"
 * until the run actually settles (run()'s finally), so a fresh scan cannot
 * start in the cancellation window and clobber the still-running scan's state.
 */
export class ScanSession {
  private inflight: Promise<unknown> | null = null
  private abortController: AbortController | null = null

  /** True from the moment a run starts until it settles (resolve OR reject). */
  get isScanning(): boolean {
    return this.inflight !== null
  }

  /**
   * Run `task`, passing it an AbortSignal that cancel() trips. Rejects
   * immediately if a scan is already in progress. The session is marked idle
   * again only once the task settles.
   */
  async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.inflight) throw new Error('Scan already in progress')
    const controller = new AbortController()
    this.abortController = controller
    const promise = task(controller.signal)
    this.inflight = promise
    try {
      return await promise
    } finally {
      this.inflight = null
      this.abortController = null
    }
  }

  /** Request cancellation of the in-flight scan. No-op when nothing is running. */
  cancel(): void {
    this.abortController?.abort()
  }
}
