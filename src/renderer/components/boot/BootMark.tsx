import { useId } from 'react'

// The sword of CustosMark, drawn by CSS (boot.css) so the intro needs no animation library.
const PARTS = [
  { d: 'M12 2.5l1.6 3.4v7.3h-3.2V5.9L12 2.5z', width: 1.6, fill: true },
  { d: 'M7.4 14.2h9.2', width: 1.8, fill: false },
  { d: 'M12 14.2v4.2', width: 1.8, fill: false }
] as const

/** Strokes trace in one after another, the blade fills, then a light runs through the sword. */
export function BootMark() {
  const id = useId().replace(/:/g, '')
  const grad = `boot-grad-${id}`
  const mask = `boot-mask-${id}`
  const sweep = `boot-sweep-${id}`
  return (
    <svg className="boot-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--ink)" />
          <stop offset="55%" stopColor="var(--scan)" />
          <stop offset="100%" stopColor="var(--scan-2)" />
        </linearGradient>
        <linearGradient id={sweep} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--ink)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--ink)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--ink)" stopOpacity="0" />
        </linearGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <g stroke="white" fill="none" strokeLinejoin="round" strokeLinecap="round">
            {PARTS.map((p) => (
              <path key={p.d} d={p.d} strokeWidth={p.width} />
            ))}
            <circle cx="12" cy="20" r="1.4" strokeWidth="1.6" />
          </g>
        </mask>
      </defs>
      {PARTS.map((p, i) => (
        <path
          key={p.d}
          className={`boot-stroke boot-stroke-${i}${p.fill ? ' boot-fill' : ''}`}
          d={p.d}
          pathLength={1}
          stroke={`url(#${grad})`}
          strokeWidth={p.width}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {/* A path, not a <circle>: dashing a circle by pathLength leaves a gap in Chromium. */}
      <path
        className="boot-stroke boot-stroke-3 boot-fill"
        d="M12 18.6a1.4 1.4 0 1 0 0 2.8a1.4 1.4 0 1 0 0-2.8z"
        pathLength={1}
        stroke={`url(#${grad})`}
        strokeWidth="1.6"
      />
      <g mask={`url(#${mask})`}>
        <rect className="boot-sweep boot-fx" x="-8" y="0" width="8" height="24" fill={`url(#${sweep})`} />
      </g>
    </svg>
  )
}
