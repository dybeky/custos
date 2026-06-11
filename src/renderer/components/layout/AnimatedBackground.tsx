/**
 * Full-viewport backdrop: two faint warm glows drifting behind the app so the
 * near-black base feels warm rather than flat — espresso steam, not lava lamp.
 *
 * Fixed + pointer-events-none so it never interferes with the UI; sits at z-0
 * while the app shell renders at z-10. Motion is disabled under
 * prefers-reduced-motion (see .animate-blob-* in index.css).
 */
const CARAMEL = '#C8A47E'
const CREAM = '#EDE7DE'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Caramel glow — top left */}
      <div
        className="absolute -top-32 -left-24 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-[0.07] animate-blob-1"
        style={{ background: `radial-gradient(circle, ${CARAMEL}, transparent 70%)` }}
      />
      {/* Cream glow — bottom right */}
      <div
        className="absolute -bottom-40 -right-24 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-[0.05] animate-blob-2"
        style={{ background: `radial-gradient(circle, ${CREAM}, transparent 70%)` }}
      />
    </div>
  )
}
