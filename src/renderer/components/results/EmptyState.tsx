/**
 * "Nothing here" state. The clean variant is the reward for a check with no
 * findings: a shield that draws itself, a soft pulse ring and a few orbiting
 * sparks. The plain variant is a quiet one-line box for empty tabs and filters.
 * Motion is CSS-only and switched off under prefers-reduced-motion.
 */
export function EmptyState({
  variant = 'plain',
  title,
  text
}: {
  variant?: 'clean' | 'plain'
  title?: string
  text: string
}) {
  if (variant === 'plain') {
    return (
      <div data-testid="empty-state" className="rounded-2xl border border-[color:var(--line)] bg-panel/40 p-10 text-center text-sm text-ink-dim">
        {title && <p className="mb-1 font-medium text-ink">{title}</p>}
        {text}
      </div>
    )
  }
  return (
    <div data-testid="empty-state-clean" className="rounded-2xl border border-scan/25 bg-scan/[0.06] px-6 py-8 text-center">
      <div className="relative mx-auto mb-4 h-20 w-20">
        <span className="clean-pulse absolute inset-2 rounded-full border border-scan/50" />
        <span className="clean-orbit absolute inset-0">
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-scan" />
          <span className="absolute bottom-2 right-1 h-1 w-1 rounded-full bg-scan/70" />
          <span className="absolute bottom-3 left-0 h-1 w-1 rounded-full bg-ink/60" />
        </span>
        <svg viewBox="0 0 24 24" className="absolute inset-3 text-scan" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path className="clean-shield" d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
          <path className="clean-check" d="M8.5 12l2.5 2.5 4.5-5" />
        </svg>
      </div>
      {title && <p className="font-display text-base font-bold text-ink">{title}</p>}
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-dim">{text}</p>
    </div>
  )
}

/**
 * What the overview's evidence preview shows when the list is empty: the clean
 * reward when the check found nothing at all, a quiet note when only context
 * (system information) was collected.
 */
export function NoEvidence({ totalFindings, t }: { totalFindings: number; t: (key: string) => string }) {
  return totalFindings > 0 ? (
    <EmptyState text={t('results.contextOnly')} />
  ) : (
    <EmptyState variant="clean" title={t('results.cleanTitle')} text={t('results.cleanText')} />
  )
}
