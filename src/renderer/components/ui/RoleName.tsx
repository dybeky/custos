import { cn } from '../../utils/cn'

interface RoleNameProps {
  username: string
  role: string | null
  className?: string
}

/** Username with a role-driven color/glow (mirrors web .role-glow). */
export function RoleName({ username, role, className }: RoleNameProps) {
  const r = (role ?? '').toLowerCase()
  const roleClass =
    r === 'admin' ? 'text-scan text-glow'
    : r === 'mod' || r === 'moderator' ? 'text-amber'
    : 'text-ink'
  return <span className={cn('font-display font-semibold', roleClass, className)}>{username}</span>
}
