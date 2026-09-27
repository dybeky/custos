/**
 * Minimal line icons for the modern shell (24px grid, 1.6 stroke, currentColor).
 * Kept local so the modern UI has one consistent icon voice.
 */
type IconProps = { className?: string }

function Svg({ className = 'w-4 h-4', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconShield = (p: IconProps) => <Svg {...p}><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></Svg>
export const IconPulse = (p: IconProps) => <Svg {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></Svg>
export const IconTools = (p: IconProps) => <Svg {...p}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5z" /></Svg>
export const IconChip = (p: IconProps) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></Svg>
export const IconSettings = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Svg>
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
export const IconPlay = (p: IconProps) => <Svg {...p}><path d="M8 5l11 7-11 7V5z" /></Svg>
export const IconStop = (p: IconProps) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
export const IconDownload = (p: IconProps) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>
export const IconRefresh = (p: IconProps) => <Svg {...p}><path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" /></Svg>
export const IconAlert = (p: IconProps) => <Svg {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></Svg>
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
export const IconX = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IconMinus = (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>
export const IconSquare = (p: IconProps) => <Svg {...p}><rect x="5" y="5" width="14" height="14" rx="1.5" /></Svg>
export const IconLayout = (p: IconProps) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>
export const IconGlobe = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></Svg>
export const IconFile = (p: IconProps) => <Svg {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></Svg>
export const IconArrow = (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
