// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the clean variant with title and text', () => {
    render(<EmptyState variant="clean" title="All clear" text="Nothing suspicious." />)
    expect(screen.getByTestId('empty-state-clean')).toBeTruthy()
    expect(screen.getByText('All clear')).toBeTruthy()
    expect(screen.getByText('Nothing suspicious.')).toBeTruthy()
  })
  it('renders the plain variant', () => {
    render(<EmptyState text="No findings to show." />)
    expect(screen.getByTestId('empty-state')).toBeTruthy()
    expect(screen.queryByTestId('empty-state-clean')).toBeNull()
  })
})

import { NoEvidence } from './EmptyState'

describe('NoEvidence', () => {
  const t = (k: string) => k
  it('shows the clean state for an empty result', () => {
    render(<NoEvidence totalFindings={0} t={t} />)
    expect(screen.getByTestId('empty-state-clean')).toBeTruthy()
    expect(screen.getByText('results.cleanTitle')).toBeTruthy()
  })
  it('does not show it when something was found', () => {
    render(<NoEvidence totalFindings={3} t={t} />)
    expect(screen.queryByTestId('empty-state-clean')).toBeNull()
    expect(screen.getByText('results.contextOnly')).toBeTruthy()
  })
})
