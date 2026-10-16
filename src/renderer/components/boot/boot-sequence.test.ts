import { describe, it, expect } from 'vitest'
import { BOOT_GRACE_MS, BOOT_MAX_MS, BOOT_MIN_MS, BOOT_STEPS, bootFrame, type BootStepId } from './boot-sequence'

const all = new Set<BootStepId>(BOOT_STEPS)
const only = (...ids: BootStepId[]) => new Set<BootStepId>(ids)

describe('bootFrame', () => {
  it('shows nothing at first, then the first status line', () => {
    expect(bootFrame({ elapsedMs: 0, done: all })).toMatchObject({ progress: 0, revealed: 0, finished: false })
    expect(bootFrame({ elapsedMs: 300, done: all }).revealed).toBe(1)
  })

  it('paces quick steps so every status line is readable', () => {
    const seen = [300, 500, 700, 900, 1100].map((ms) => bootFrame({ elapsedMs: ms, done: all }).revealed)
    expect(seen).toEqual([1, 2, 3, 4, 5])
  })

  it('does not run ahead of the real work', () => {
    // Only settings is done: the second line may show (it is running), the rest wait.
    expect(bootFrame({ elapsedMs: 1100, done: only('settings') }).revealed).toBe(2)
    expect(bootFrame({ elapsedMs: 1100, done: only() }).revealed).toBe(1)
    // A later step finished early does not skip an earlier one.
    expect(bootFrame({ elapsedMs: 1100, done: only('account', 'system') }).revealed).toBe(1)
  })

  it('never lets progress go backwards', () => {
    const done = new Set<BootStepId>()
    let last = 0
    for (let ms = 0; ms < 3000; ms += 16) {
      if (ms === 400) done.add('settings')
      if (ms === 1500) done.add('signatures')
      if (ms === 1700) done.add('scanners')
      if (ms === 2300) done.add('system')
      if (ms === 2500) done.add('account')
      const p = bootFrame({ elapsedMs: ms, done: new Set(done) }).progress
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
  })

  it('is not at 100% before the last status line has had its turn', () => {
    for (let ms = 0; ms < 1000; ms += 25) expect(bootFrame({ elapsedMs: ms, done: all }).progress).toBeLessThan(1)
    expect(bootFrame({ elapsedMs: 1200, done: all })).toMatchObject({ ready: true, progress: 1 })
  })

  it('leaves at the minimum when everything is ready', () => {
    expect(bootFrame({ elapsedMs: BOOT_MIN_MS - 1, done: all }).finished).toBe(false)
    expect(bootFrame({ elapsedMs: BOOT_MIN_MS, done: all })).toMatchObject({ finished: true, progress: 1, ready: true })
  })

  it('honours a shorter minimum', () => {
    expect(bootFrame({ elapsedMs: 700, done: all, minMs: 700 }).finished).toBe(true)
  })

  it('holds a waiting state while the essential step is pending, with real progress', () => {
    const f = bootFrame({ elapsedMs: BOOT_MIN_MS + 2000, done: only() })
    expect(f).toMatchObject({ finished: false, waiting: true, revealed: 1 })
    expect(f.progress).toBeGreaterThan(0)
    expect(f.progress).toBeLessThan(0.2)
  })

  it('does not wait long for optional steps once the minimum has passed', () => {
    const done = only('settings')
    expect(bootFrame({ elapsedMs: BOOT_MIN_MS + BOOT_GRACE_MS - 1, done }).finished).toBe(false)
    expect(bootFrame({ elapsedMs: BOOT_MIN_MS + BOOT_GRACE_MS, done }).finished).toBe(true)
  })

  it('always gives up at the maximum', () => {
    expect(bootFrame({ elapsedMs: BOOT_MAX_MS, done: only() }).finished).toBe(true)
  })
})
