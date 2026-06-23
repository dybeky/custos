// Pure, dependency-free role registry mirroring the web's lib/roles.ts so the
// desktop app colours role-holders' names with the EXACT same hex/glow as the
// web product. `color` is the solid hex for the name; `rgb` is the same colour
// as an "r, g, b" triplet so the glow can be a soft rgba(). Members (no role),
// null, and unknown roles return null (default ink text, no glow).

export type Role = 'owner' | 'admin' | 'moderator' | 'trusted'

export const ROLES: Record<Role, { label: string; color: string; rgb: string }> = {
  owner: { label: 'Owner', color: '#e3d644', rgb: '227, 214, 68' },
  admin: { label: 'Admin', color: '#db2109', rgb: '219, 33, 9' },
  moderator: { label: 'Moderator', color: '#ff7700', rgb: '255, 119, 0' },
  trusted: { label: 'Trusted', color: '#e46fe8', rgb: '228, 111, 232' },
}

/** The web-matched colour info for a role, or null for member/null/unknown. */
export function roleInfo(
  role: string | null | undefined,
): { label: string; color: string; rgb: string } | null {
  if (!role) return null
  return ROLES[role.toLowerCase() as Role] ?? null
}
