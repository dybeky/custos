/** Primary destinations of the modern shell, in display order. */
export const MODERN_NAV = [
  { path: '/', key: 'check' },
  { path: '/live', key: 'live' },
  { path: '/history', key: 'history' },
  { path: '/tools', key: 'tools' },
  { path: '/system', key: 'system' }
] as const

export type ModernNavKey = (typeof MODERN_NAV)[number]['key']
