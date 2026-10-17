import { describe, it, expect, vi } from 'vitest'
import { radioGroupKeys } from './radio-keys'

describe('radioGroupKeys', () => {
  const items = ['a', 'b', 'c'] as const
  const press = (key: string, current: (typeof items)[number]) => {
    const select = vi.fn()
    const keys = radioGroupKeys(items, current, select)
    const preventDefault = vi.fn()
    keys.onKeyDown({ key, preventDefault, currentTarget: { querySelectorAll: () => [] } } as never)
    return { select, preventDefault }
  }

  it('only the chosen item is in the tab order', () => {
    const keys = radioGroupKeys(items, 'b', () => {})
    expect(items.map((i) => keys.tabIndexOf(i))).toEqual([-1, 0, -1])
  })
  it('arrows move the choice and wrap around', () => {
    expect(press('ArrowRight', 'a').select).toHaveBeenCalledWith('b')
    expect(press('ArrowRight', 'c').select).toHaveBeenCalledWith('a')
    expect(press('ArrowLeft', 'a').select).toHaveBeenCalledWith('c')
    expect(press('ArrowUp', 'b').select).toHaveBeenCalledWith('a')
  })
  it('ignores other keys', () => {
    const r = press('Enter', 'a')
    expect(r.select).not.toHaveBeenCalled()
    expect(r.preventDefault).not.toHaveBeenCalled()
  })
})
