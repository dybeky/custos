// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoleName } from './RoleName'

// jsdom normalizes hex colours to rgb(...) in element.style.color, so we assert
// the rgb form. These are the web's exact role colours (custosweb/lib/roles.ts).
describe('RoleName', () => {
  it('renders the username', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo')).toBeTruthy()
  })

  it('colours owner with the web owner colour', () => {
    render(<RoleName username="neo" role="owner" />)
    expect(screen.getByText('neo').style.color).toBe('rgb(227, 214, 68)')
  })

  it('colours admin with the web admin colour', () => {
    render(<RoleName username="neo" role="admin" />)
    expect(screen.getByText('neo').style.color).toBe('rgb(219, 33, 9)')
  })

  it('colours moderator with the web moderator colour', () => {
    render(<RoleName username="neo" role="moderator" />)
    expect(screen.getByText('neo').style.color).toBe('rgb(255, 119, 0)')
  })

  it('colours trusted with the web trusted colour', () => {
    render(<RoleName username="neo" role="trusted" />)
    expect(screen.getByText('neo').style.color).toBe('rgb(228, 111, 232)')
  })

  it('colours the letters ONLY — no glow/halo (text-shadow) behind a role-holder', () => {
    render(<RoleName username="neo" role="admin" />)
    const el = screen.getByText('neo')
    expect(el.style.color).toBe('rgb(219, 33, 9)')
    expect(el.style.textShadow).toBe('')
  })

  it('renders default ink with no role colour or glow for a null role', () => {
    render(<RoleName username="anon" role={null} />)
    const el = screen.getByText('anon')
    expect(el.className).toContain('text-ink')
    expect(el.style.color).toBe('')
    expect(el.style.textShadow).toBe('')
  })

  it('renders default ink with no glow for an unknown / member role', () => {
    render(<RoleName username="bob" role="member" />)
    const el = screen.getByText('bob')
    expect(el.className).toContain('text-ink')
    expect(el.style.color).toBe('')
    expect(el.style.textShadow).toBe('')
  })
})
