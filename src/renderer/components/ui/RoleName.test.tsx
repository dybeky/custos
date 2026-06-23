// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoleName } from './RoleName'

describe('RoleName', () => {
  it('renders the username', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo')).toBeTruthy()
  })
  it('applies a role glow class for admin', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo').className).toContain('text-scan')
  })
  it('renders plain ink for a null role', () => {
    render(<RoleName username="anon" role={null} />)
    expect(screen.getByText('anon').className).toContain('text-ink')
  })
})
