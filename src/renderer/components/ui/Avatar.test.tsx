// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Avatar } from './Avatar'
import type { PublicUser } from '../../../shared/types'

const base: PublicUser = { id: 'u1', username: 'Neo', uid: 7, avatarVersion: 1, role: null, status: 'active' }

describe('Avatar', () => {
  it('renders initials when there is no image', () => {
    render(<Avatar user={base} />)
    expect(screen.getByText('N')).toBeTruthy()
  })
  it('renders the public image when provided and never embeds a token', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('/api/avatar/u1?v=1')
    expect(img.src.toLowerCase()).not.toContain('bearer')
    expect(img.src.toLowerCase()).not.toContain('token')
  })
  it('retries once with a cache-buster on the first load error (stale-header self-heal)', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    fireEvent.error(screen.getByRole('img'))
    // Still an <img> (not initials yet), now with a cache-busting param.
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('cb=')
    expect(img.src).toContain('/api/avatar/u1?v=1')
  })
  it('falls back to initials only after the retry also fails', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    fireEvent.error(screen.getByRole('img')) // 1st: retry with cache-buster
    fireEvent.error(screen.getByRole('img')) // 2nd: give up
    expect(screen.getByText('N')).toBeTruthy()
  })
})
