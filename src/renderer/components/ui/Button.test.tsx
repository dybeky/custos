// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
import { Button } from './Button'

describe('Button conventions (spec §7.3)', () => {
  it('primary uses on-accent text + display bold + hover lift', () => {
    render(<Button>Go</Button>)
    const cls = screen.getByText('Go').closest('button')!.className
    expect(cls).toContain('text-on-accent')
    expect(cls).toContain('font-bold')
    expect(cls).toContain('-translate-y-0.5')
  })
  it('oauth variant uses line-strong border + bg-bg', () => {
    render(<Button variant="oauth">OAuth</Button>)
    const cls = screen.getByText('OAuth').closest('button')!.className
    expect(cls).toContain('var(--line-strong)')
    expect(cls).toContain('bg-bg')
  })
})
