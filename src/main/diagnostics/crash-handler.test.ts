import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const listeners: Record<string, (...args: any[]) => void> = {}
  const store: Record<string, any> = {}
  return {
    listeners,
    store,
    app: {
      on: vi.fn((ev: string, fn: (...args: any[]) => void) => { listeners[ev] = fn }),
      isReady: vi.fn(() => true),
      relaunch: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
      disableHardwareAcceleration: vi.fn(),
      getGPUInfo: vi.fn(async () => ({ gpuDevice: [{ vendorId: 0x10de, active: true }] }))
    },
    dialog: { showMessageBoxSync: vi.fn((..._args: any[]) => 0), showErrorBox: vi.fn() },
    clipboard: { writeText: vi.fn() },
    fatal: { fn: null as null | ((e: Error) => void) },
    openExternal: vi.fn()
  }
})

vi.mock('electron', () => ({ app: h.app, dialog: h.dialog, clipboard: h.clipboard, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('fs', async (orig) => ({ ...(await orig<typeof import('fs')>()), readFileSync: () => 'log line 1\nlog line 2' }))
vi.mock('../services/app-store', () => ({
  appStore: { get: (k: string) => h.store[k], set: (k: string, v: any) => { h.store[k] = v } }
}))
vi.mock('../services/logger', () => ({
  logger: {
    info: vi.fn(), error: vi.fn(), getLogPath: () => 'C:\\custos\\custos-log.txt',
    setFatalHandler: (fn: (e: Error) => void) => { h.fatal.fn = fn }
  }
}))
vi.mock('../utils/safe-open', () => ({ safeOpenExternal: h.openExternal }))

import { installCrashHandlers, applyGpuFallback, NO_GPU_FLAG } from './crash-handler'

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(h.store)) delete h.store[k]
})

describe('crash handler', () => {
  it('explains a fatal error with the certain fix and opens it on request', () => {
    installCrashHandlers()
    h.dialog.showMessageBoxSync.mockReturnValueOnce(0) // first button = the fix
    h.fatal.fn!(Object.assign(new Error('VCRUNTIME140.dll was not found'), { code: 'ERR_DLOPEN_FAILED' }))
    const opts = h.dialog.showMessageBoxSync.mock.calls[0][0] as any
    expect(opts.message).toBe('Microsoft Visual C++ Redistributable is missing')
    expect(opts.buttons[0]).toBe('Open Microsoft download page')
    expect(h.openExternal).toHaveBeenCalledWith(expect.stringContaining('learn.microsoft.com'))
  })

  it('does not offer a download for an unknown error', () => {
    installCrashHandlers()
    h.fatal.fn!(new TypeError('x is undefined'))
    const opts = h.dialog.showMessageBoxSync.mock.calls[0][0] as any
    expect(opts.buttons).toEqual(['Close', 'Copy log'])
  })

  it('copies the log (the session folder holding it is wiped on exit)', () => {
    installCrashHandlers()
    h.dialog.showMessageBoxSync.mockReturnValueOnce(1) // [Close, Copy log] → Copy log
    h.fatal.fn!(new TypeError('x is undefined'))
    expect(h.clipboard.writeText).toHaveBeenCalledWith('log line 1\nlog line 2')
  })

  it('falls back to a plain error box before the app is ready', () => {
    installCrashHandlers()
    h.app.isReady.mockReturnValueOnce(false)
    h.fatal.fn!(new Error('boom'))
    expect(h.dialog.showErrorBox).toHaveBeenCalled()
  })

  it('after a GPU crash: restarts without acceleration on request, saving nothing', async () => {
    installCrashHandlers()
    h.dialog.showMessageBoxSync.mockReturnValueOnce(1) // [driver page, Restart, log] → Restart
    h.listeners['child-process-gone']({}, { type: 'GPU', reason: 'crashed', exitCode: 1 })
    await vi.waitFor(() => expect(h.app.relaunch).toHaveBeenCalled())
    const { args } = h.app.relaunch.mock.calls[0][0] as { args: string[] }
    expect(args.filter((a) => a === NO_GPU_FLAG)).toHaveLength(1)
    expect(h.app.quit).toHaveBeenCalled() // a normal quit, so the session folder is wiped
    expect(h.store).toEqual({})
    const opts = h.dialog.showMessageBoxSync.mock.calls[0][0] as any
    expect(opts.buttons[0]).toBe('Open NVIDIA driver downloads')
  })

  it('starts without acceleration only when relaunched with the flag', () => {
    applyGpuFallback(['custos.exe'])
    expect(h.app.disableHardwareAcceleration).not.toHaveBeenCalled()
    applyGpuFallback(['custos.exe', NO_GPU_FLAG])
    expect(h.app.disableHardwareAcceleration).toHaveBeenCalled()
  })
})
