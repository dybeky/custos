import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC_CHANNELS } from '../../shared/types'

const close = vi.fn()
vi.mock('./native/memory', () => ({
  isMemoryNativeAvailable: () => true,
  openGameProcess: () => ({ handle: 42 }),
  listModules: () => [{ szModule: 'Unturned.exe' }],
  close: (h: number) => close(h)
}))
vi.mock('./process-locator', () => ({
  findGameProcess: () => ({ pid: 1234, name: 'Unturned.exe' })
}))
vi.mock('./signatures', () => ({ loadSignatures: () => ({}) }))

// Each detector is a stub recording that it ran; the first one can trip the
// abort signal to simulate a user cancelling mid-scan.
const ran: string[] = []
let onFirst: () => void = () => {}
function stub(id: string) {
  return {
    id,
    name: id,
    run: vi.fn(async () => {
      ran.push(id)
      if (id === 'aob') onFirst()
      return []
    })
  }
}
vi.mock('./detectors/aob-detector', () => ({ aobDetector: stub('aob') }))
vi.mock('./detectors/injected-module-detector', () => ({ injectedModuleDetector: stub('injected') }))
vi.mock('./detectors/mono-detector', () => ({ monoDetector: stub('mono') }))
vi.mock('./detectors/thread-detector', () => ({ threadDetector: stub('thread') }))
vi.mock('./detectors/self-integrity-detector', () => ({ selfIntegrityDetector: stub('self') }))
vi.mock('./detectors/hook-detector', () => ({ hookDetector: stub('hook') }))

import { runLiveScan } from './live-orchestrator'

beforeEach(() => {
  ran.length = 0
  close.mockClear()
  onFirst = () => {}
})

describe('runLiveScan', () => {
  it('runs every detector, closes the handle and emits completion', async () => {
    const emit = vi.fn()
    await runLiveScan({ emit, signal: new AbortController().signal })

    expect(ran).toEqual(['aob', 'injected', 'mono', 'thread', 'self', 'hook'])
    expect(close).toHaveBeenCalledWith(42)
    expect(emit).toHaveBeenCalledWith(IPC_CHANNELS.LIVE_SCAN_COMPLETE, [])
  })

  it('stops before the next detector once aborted, still closing the handle', async () => {
    const controller = new AbortController()
    onFirst = () => controller.abort()
    const emit = vi.fn()

    await runLiveScan({ emit, signal: controller.signal })

    expect(ran).toEqual(['aob'])
    expect(close).toHaveBeenCalledWith(42)
    expect(emit).toHaveBeenCalledWith(IPC_CHANNELS.LIVE_SCAN_COMPLETE, [])
  })
})
