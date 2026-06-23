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
  it('falls back to initials on image load error', () => {
    render(<Avatar user={{ ...base, image: 'https://97437.dev/api/avatar/u1?v=1' }} />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByText('N')).toBeTruthy()
  })
})
