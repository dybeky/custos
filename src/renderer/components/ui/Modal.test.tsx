// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Modal } from './Modal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

describe('Modal', () => {
  it('escapes a transformed/filtered ancestor (position:fixed must resolve against the viewport, not the header)', () => {
    // The app header uses `backdrop-blur-xl`. A backdrop-filter (like transform/
    // filter) establishes a containing block for position:fixed descendants, so a
    // modal rendered INLINE inside the header gets trapped: pinned to the 40px
    // header strip and its full-screen backdrop never covers the page. Rendering
    // through a portal to document.body is what keeps the overlay centered and the
    // backdrop full-screen. This reproduces the trap and asserts the modal escapes.
    render(
      <div
        data-testid="filtered-ancestor"
        style={{ backdropFilter: 'blur(8px)', transform: 'translateZ(0)' }}
      >
        <Modal isOpen onClose={() => {}} title="Sign in">
          <p>body</p>
        </Modal>
      </div>
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    // The dialog must NOT live inside the transformed ancestor — that's the trap.
    expect(
      within(screen.getByTestId('filtered-ancestor')).queryByRole('dialog')
    ).toBeNull()
  })

  it('centers the modal: overlay is fixed inset-0 with flex centering', () => {
    render(
      <Modal isOpen onClose={() => {}} title="Sign in">
        <p>body</p>
      </Modal>
    )
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    expect(overlay.className).toContain('fixed')
    expect(overlay.className).toContain('inset-0')
    expect(overlay.className).toContain('items-center')
    expect(overlay.className).toContain('justify-center')
  })

  it('keeps the focus where the user put it when the parent re-renders with a new onClose', async () => {
    const view = (onClose: () => void) => (
      <Modal isOpen onClose={onClose} title="Pick">
        <button>first</button>
        <button>second</button>
      </Modal>
    )
    const { rerender } = render(view(() => {}))
    await new Promise((r) => setTimeout(r, 5))
    const second = screen.getByText('second')
    second.focus()
    // A progress event, a store update: the parent renders again with a fresh arrow function.
    rerender(view(() => {}))
    await new Promise((r) => setTimeout(r, 5))
    expect(document.activeElement).toBe(second)
  })
})
