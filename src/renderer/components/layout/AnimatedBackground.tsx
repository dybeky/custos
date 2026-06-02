/**
 * Full-viewport animated backdrop: large, blurred pink/yellow orbs that drift
 * slowly behind the whole app, over a soft diagonal pink->yellow wash so the
 * dark base reads as tinted rather than black.
 *
 * Fixed + pointer-events-none so it never interferes with the UI; sits at z-0
 * while the app shell renders at z-10. Motion is disabled under
 * prefers-reduced-motion (see .animate-blob-* in index.css).
 */
const PINK = '#FF678B'
const YELLOW = '#FFF48D'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Overall colour wash so even gaps between panels feel tinted. */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${PINK}1f 0%, transparent 45%, transparent 60%, ${YELLOW}1c 100%)`
        }}
      />
      {/* Pink orb — top left */}
      <div
        className="absolute -top-32 -left-24 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-40 animate-blob-1"
        style={{ background: `radial-gradient(circle, ${PINK}, transparent 70%)` }}
      />
      {/* Yellow orb — bottom right */}
      <div
        className="absolute -bottom-40 -right-24 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-[0.32] animate-blob-2"
        style={{ background: `radial-gradient(circle, ${YELLOW}, transparent 70%)` }}
      />
      {/* Yellow orb — top right */}
      <div
        className="absolute -top-24 right-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-[0.22] animate-blob-4"
        style={{ background: `radial-gradient(circle, ${YELLOW}, transparent 70%)` }}
      />
      {/* Pink orb — center drift */}
      <div
        className="absolute top-1/3 left-1/3 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-[0.28] animate-blob-3"
        style={{ background: `radial-gradient(circle, ${PINK}, transparent 70%)` }}
      />
    </div>
  )
}
