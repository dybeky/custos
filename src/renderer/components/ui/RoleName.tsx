import { cn } from '../../utils/cn'
import { roleInfo } from '../../utils/roles'

interface RoleNameProps {
  username: string
  role: string | null
  className?: string
}

/**
 * Username coloured to faithfully match the web's role registry (lib/roles.ts):
 * owner/admin/moderator/trusted get the web's exact hex colour applied to the
 * letters ONLY — no glow/halo behind the text. Members / null / unknown roles
 * render plain default ink. Self-contained inline style (no .role-glow class).
 */
export function RoleName({ username, role, className }: RoleNameProps) {
  const info = roleInfo(role)
  if (info) {
    return (
      <span
        className={cn('font-display font-semibold', className)}
        style={{ color: info.color }}
      >
        {username}
      </span>
    )
  }
  return <span className={cn('font-display font-semibold text-ink', className)}>{username}</span>
}
