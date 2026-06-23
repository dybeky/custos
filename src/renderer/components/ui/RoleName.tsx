import { cn } from '../../utils/cn'
import { roleInfo } from '../../utils/roles'

interface RoleNameProps {
  username: string
  role: string | null
  className?: string
}

/**
 * Username coloured to faithfully match the web's role registry (lib/roles.ts):
 * owner/admin/moderator/trusted get the web's exact hex colour plus a soft,
 * static same-colour glow. We deliberately do NOT port the web's animated
 * specular shine — a static text-shadow is the tool-appropriate match for the
 * desktop scanner. Members / null / unknown roles render plain default ink with
 * no glow. Self-contained inline style (no dependency on a .role-glow class).
 */
export function RoleName({ username, role, className }: RoleNameProps) {
  const info = roleInfo(role)
  if (info) {
    return (
      <span
        className={cn('font-display font-semibold', className)}
        style={{ color: info.color, textShadow: `0 0 24px rgba(${info.rgb}, 0.45)` }}
      >
        {username}
      </span>
    )
  }
  return <span className={cn('font-display font-semibold text-ink', className)}>{username}</span>
}
