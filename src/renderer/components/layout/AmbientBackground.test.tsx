// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AmbientBackground } from './AmbientBackground'
import { useScanStore } from '../../stores/scan-store'

const noop = () => {}
const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop), set: () => true })

let raf: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never)
  raf = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', noop)
  useScanStore.setState({ status: 'idle' })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mount = () => render(<MemoryRouter><AmbientBackground /></MemoryRouter>)

describe('AmbientBackground', () => {
  it('animates while idle and stops requesting frames during a scan', () => {
    // one frame goes to re-reading the theme colour; the draw loop is the second
    const idle = mount()
    expect(raf).toHaveBeenCalledTimes(2)
    idle.unmount()
    raf.mockClear()
    useScanStore.setState({ status: 'scanning' })
    mount()
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('resumes after the scan', () => {
    mount()
    act(() => useScanStore.setState({ status: 'scanning' }))
    raf.mockClear()
    act(() => useScanStore.setState({ status: 'completed' }))
    expect(raf).toHaveBeenCalled()
  })

  it('removes its window listeners on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = mount()
    unmount()
    for (const [type] of add.mock.calls) {
      if (['pointermove', 'resize', 'pointerdown'].includes(type)) {
        expect(remove.mock.calls.some(([t]) => t === type)).toBe(true)
      }
    }
  })
})
