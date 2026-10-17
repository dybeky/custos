// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Utilities } from './Utilities'
import { UTILITIES, filterUtilities, siteHost } from '../utils/utilities-view'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

const openExternal = vi.fn()
beforeEach(() => {
  openExternal.mockReset()
  ;(window as any).electronAPI = { openExternal }
})

describe('Utilities page', () => {
  it('lists every tool and opens only its https site in the browser', () => {
    render(<Utilities />)
    const buttons = screen.getAllByText(/utilities\.openWebsite/)
    expect(buttons).toHaveLength(UTILITIES.length)
    fireEvent.click(buttons[0])
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal.mock.calls[0][0]).toMatch(/^https:\/\//)
  })

  it('narrows by tab', () => {
    render(<Utilities />)
    fireEvent.click(screen.getByRole('tab', { name: /utilities\.tabProcesses/ }))
    expect(screen.getAllByText(/utilities\.openWebsite/)).toHaveLength(1)
    expect(screen.getByText('System Informer')).toBeTruthy()
  })

  it('searches by name and site, and says so when nothing matches', () => {
    render(<Utilities />)
    const box = screen.getByPlaceholderText('utilities.search')
    fireEvent.change(box, { target: { value: 'voidtools' } })
    expect(screen.getByText('Everything')).toBeTruthy()
    expect(screen.queryByText('USBDeview')).toBeNull()
    fireEvent.change(box, { target: { value: 'zzzz-nothing' } })
    expect(screen.getByText('utilities.noMatches')).toBeTruthy()
  })
})

describe('utilities-view', () => {
  it('every tool points at an https site of its author', () => {
    for (const u of UTILITIES) {
      expect(u.url).toMatch(/^https:\/\//)
      expect(siteHost(u.url)).not.toBe('')
      expect(u.url).not.toMatch(/\.(exe|msi|zip|lnk)(\?|$)/i)
    }
  })

  it('filters by tab and text', () => {
    expect(filterUtilities('all', '', () => '')).toHaveLength(UTILITIES.length)
    expect(filterUtilities('devices', '', () => '').map((u) => u.slug)).toEqual(['usbDeview', 'everything'])
    expect(filterUtilities('all', ' NIRSOFT ', () => '').length).toBe(2)
    expect(filterUtilities('processes', 'nirsoft', () => '')).toEqual([])
  })
})
