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
    shell: { showItemInFolder: vi.fn() },
    fatal: { fn: null as null | ((e: Error) => void) },
    openExternal: vi.fn()
  }
})

vi.mock('electron', () => ({ app: h.app, dialog: h.dialog, shell: h.shell, BrowserWindow: { getAllWindows: () => [] } }))
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

import { installCrashHandlers, applyGpuFallback } from './crash-handler'

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
    expect(opts.buttons).toEqual(['Close', 'Show log file'])
  })

  it('falls back to a plain error box before the app is ready', () => {
    installCrashHandlers()
    h.app.isReady.mockReturnValueOnce(false)
    h.fatal.fn!(new Error('boom'))
    expect(h.dialog.showErrorBox).toHaveBeenCalled()
  })

  it('after a GPU crash: disables acceleration for next launch and restarts on request', async () => {
    installCrashHandlers()
    h.dialog.showMessageBoxSync.mockReturnValueOnce(1) // [driver page, Restart, log] → Restart
    h.listeners['child-process-gone']({}, { type: 'GPU', reason: 'crashed', exitCode: 1 })
    await vi.waitFor(() => expect(h.app.relaunch).toHaveBeenCalled())
    expect(h.store.diagnostics).toEqual({ disableGpu: true })
    const opts = h.dialog.showMessageBoxSync.mock.calls[0][0] as any
    expect(opts.buttons[0]).toBe('Open NVIDIA driver downloads')
  })

  it('applies the persisted GPU fallback at startup', () => {
    applyGpuFallback()
    expect(h.app.disableHardwareAcceleration).not.toHaveBeenCalled()
    h.store.diagnostics = { disableGpu: true }
    applyGpuFallback()
    expect(h.app.disableHardwareAcceleration).toHaveBeenCalled()
  })
})
