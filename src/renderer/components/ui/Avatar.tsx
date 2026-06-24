import { useEffect, useState } from 'react'
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
 * and falls back to initials on missing/failed load (§6.5). The image URL is the
 * public /api/avatar/<id>?v=<v> endpoint — never carries a bearer/grant.
 *
 * Self-heal: on the first load error we retry once with a cache-busting param. The
 * avatar response is `immutable`-cached, so if it was ever cached with a stale
 * header (e.g. a Cross-Origin-Resource-Policy that has since been relaxed server-
 * side) the same URL would stay blocked forever; a fresh URL forces a re-fetch
 * that picks up the current headers. A second failure falls back to initials.
 */
export function Avatar({ user, size = 28, className }: AvatarProps) {
  const [retry, setRetry] = useState(0) // 0 = first attempt, 1 = cache-busted retry
  const [failed, setFailed] = useState(false)

  // A new source image starts fresh (also clears a prior failure on re-login /
  // avatarVersion bump, where user.image changes).
  useEffect(() => {
    setRetry(0)
    setFailed(false)
  }, [user.image])

  const showImage = !!user.image && !failed
  const src =
    user.image && retry > 0
      ? `${user.image}${user.image.includes('?') ? '&' : '?'}cb=${retry}`
      : user.image

  const onError = (): void => {
    if (retry === 0) setRetry(1)
    else setFailed(true)
  }

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
          src={src!}
          alt={user.username}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={onError}
        />
      ) : (
        <span aria-label={user.username}>{initials(user.username)}</span>
      )}
    </span>
  )
}
