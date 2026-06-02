import { describe, it, expect } from 'vitest'
import { ScanSession } from './scan-session'

describe('ScanSession', () => {
  it('reports isScanning across the lifetime of a run', async () => {
    const session = new ScanSession()
    expect(session.isScanning).toBe(false)

    let resolveTask!: () => void
    const gate = new Promise<void>((r) => { resolveTask = r })
    const run = session.run(async () => { await gate; return 'done' })

    expect(session.isScanning).toBe(true)
    resolveTask()
    await expect(run).resolves.toBe('done')
    expect(session.isScanning).toBe(false)
  })

  it('aborts the in-flight task on cancel but stays in progress until it settles', async () => {
    const session = new ScanSession()
    let aborted = false
    let resolveTask!: () => void
    const gate = new Promise<void>((r) => { resolveTask = r })

    const run = session.run(async (signal) => {
      signal.addEventListener('abort', () => { aborted = true })
      await gate
    })

    session.cancel()
    expect(aborted).toBe(true)
    // The key invariant: cancel does NOT clear the running state. The scan is
    // still "in progress" until it actually settles, so a second scan cannot
    // start in the cancellation window and clobber the first scan's state.
    expect(session.isScanning).toBe(true)

    resolveTask()
    await run
    expect(session.isScanning).toBe(false)
  })

  it('rejects a second concurrent run while one is in progress', async () => {
    const session = new ScanSession()
    let resolveTask!: () => void
    const gate = new Promise<void>((r) => { resolveTask = r })
    const run = session.run(async () => { await gate })

    await expect(session.run(async () => 'second')).rejects.toThrow('Scan already in progress')

    resolveTask()
    await run
    // Once the first run settled, a fresh run is allowed again.
    await expect(session.run(async () => 'ok')).resolves.toBe('ok')
  })

  it('clears running state even when the task throws', async () => {
    const session = new ScanSession()
    await expect(session.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(session.isScanning).toBe(false)
  })

  it('cancel is a no-op when nothing is running', () => {
    const session = new ScanSession()
    expect(() => session.cancel()).not.toThrow()
    expect(session.isScanning).toBe(false)
  })
})
