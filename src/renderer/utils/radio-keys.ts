import type { KeyboardEvent } from 'react'

/**
 * Keyboard operation of a radio group (WAI-ARIA): arrows move the choice (radio) or the tab and
 * focus, only the chosen radio is in the tab order.
 */
export function radioGroupKeys<T>(
  items: readonly T[],
  current: T,
  select: (item: T) => void,
  role: 'radio' | 'tab' = 'radio'
): { onKeyDown: (e: KeyboardEvent<HTMLElement>) => void; tabIndexOf: (item: T) => 0 | -1 } {
  const at = Math.max(0, items.indexOf(current))
  return {
    tabIndexOf: (item) => (item === items[at] ? 0 : -1),
    onKeyDown: (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!step) return
      e.preventDefault()
      const next = items[(at + step + items.length) % items.length]
      select(next)
      const radios = e.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`)
      radios[(at + step + items.length) % items.length]?.focus()
    }
  }
}
