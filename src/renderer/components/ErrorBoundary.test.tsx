// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('i18next', () => ({ default: { t: (k: string) => k } }))
vi.mock('../utils/report-error', () => ({ reportWindowError: vi.fn() }))

let broken = true
function Page() {
  if (broken) throw new Error('malformed report')
  return <p>page ok</p>
}

describe('ErrorBoundary compact (one page)', () => {
  it('shows a retry card instead of a blank window, and retry re-renders the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    render(
      <ErrorBoundary compact>
        <Page />
      </ErrorBoundary>
    )
    expect(screen.getByText('malformed report')).toBeTruthy()
    broken = false
    fireEvent.click(screen.getByText('errorBoundary.retry'))
    expect(screen.getByText('page ok')).toBeTruthy()
  })
})
