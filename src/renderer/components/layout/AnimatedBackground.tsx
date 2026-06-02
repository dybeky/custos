/**
 * Full-viewport animated backdrop: a few large, heavily-blurred pink/yellow
 * orbs that drift slowly behind the whole app so the dark base feels alive.
 *
 * Fixed + pointer-events-none + low opacity so it never interferes with the UI;
 * sits at z-0 while the app shell renders at z-10. Motion is disabled under
 * prefers-reduced-motion (see .animate-blob-* in index.css).
 */
export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Pink orb — top left */}
      <div
        className="absolute -top-32 -left-24 w-[38rem] h-[38rem] rounded-full blur-3xl opacity-[0.14] animate-blob-1"
        style={{ background: 'radial-gradient(circle, #FF678B, transparent 70%)' }}
      />
      {/* Yellow orb — bottom right */}
      <div
        className="absolute -bottom-40 -right-24 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-[0.12] animate-blob-2"
        style={{ background: 'radial-gradient(circle, #FFF48D, transparent 70%)' }}
      />
      {/* Pink orb — center drift, faint */}
      <div
        className="absolute top-1/3 left-1/2 w-[30rem] h-[30rem] rounded-full blur-3xl opacity-[0.08] animate-blob-3"
        style={{ background: 'radial-gradient(circle, #FF678B, transparent 70%)' }}
      />
    </div>
  )
}
