/**
 * `color` at `opacity` (0–1). Works for theme variables (`var(--scan)`) as well
 * as literal colors, unlike appending a hex alpha suffix.
 */
export function alpha(color: string, opacity: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, opacity)) * 100)
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}
