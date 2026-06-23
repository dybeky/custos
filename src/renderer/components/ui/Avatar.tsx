import { useState } from 'react'
import type { PublicUser } from '../../../shared/types'
import { cn } from '../../utils/cn'

interface AvatarProps {
  user: PublicUser
  size?: number
  className?: string
}

function initials(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

/**
 * User avatar. Loads the public, token-free image from user.image when present
 * and falls back to initials on missing/failed load (§6.5). The image URL is
 * the public /api/avatar/<id>?v=<v> endpoint — never carries a bearer/grant.
 */
export function Avatar({ user, size = 28, className }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!user.image && !failed
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full overflow-hidden bg-panel-2 text-ink font-display font-bold select-none',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden={false}
    >
      {showImage ? (
        <img
          src={user.image!}
          alt={user.username}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={user.username}>{initials(user.username)}</span>
      )}
    </span>
  )
}
