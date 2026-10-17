/** Pure helpers for the ambient background canvas. */

export type Rgb = [number, number, number]

/** Soft pastels for the small drifting shapes (rgb strings, not hex). */
export const AMBIENT_PALETTE: readonly string[] = [
  'rgb(255, 138, 216)',
  'rgb(95, 227, 255)',
  'rgb(255, 215, 94)',
  'rgb(169, 139, 255)',
  'rgb(94, 224, 138)',
  'rgb(255, 157, 107)'
]

export const FALLBACK_ACCENT: Rgb = [200, 255, 46]

/** Parses a CSS channel triple such as "200 255 46" (also "200,255,46"). */
export function parseRgbChannels(raw: string, fallback: Rgb = FALLBACK_ACCENT): Rgb {
  const m = /^\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*$/.exec(raw)
  if (!m) return fallback
  return [Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3])]
}

/** Initial share of items drawn: fewer on weak machines. */
export function initialQuality(cores: number | undefined): number {
  return cores && cores <= 4 ? 0.6 : 1
}

/**
 * Tracks late frames: returns the next quality and late-counter. After a long
 * run of slow frames the quality drops by a step (never below the floor).
 */
export function stepQuality(quality: number, late: number, dt: number): { quality: number; late: number } {
  late = Math.max(0, late + (dt > 0.026 ? 1 : -1))
  if (late > 90 && quality > 0.3) return { quality: quality * 0.6, late: 0 }
  return { quality, late }
}
