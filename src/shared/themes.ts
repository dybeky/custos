/** Color themes. Channels live in renderer/styles/index.css ([data-theme]). */
export const COLOR_THEMES = ['espresso', 'graphite', 'emerald', 'violet'] as const
export type ColorTheme = (typeof COLOR_THEMES)[number]

export const DEFAULT_THEME: ColorTheme = 'espresso'

export function isColorTheme(v: unknown): v is ColorTheme {
  return typeof v === 'string' && (COLOR_THEMES as readonly string[]).includes(v)
}

/**
 * Per-theme swatches: the window background painted before the renderer loads
 * (so launch never flashes another theme's color) and the picker preview.
 */
export const THEME_SWATCHES: Record<ColorTheme, { bg: string; panel: string; accent: string; alert: string }> = {
  espresso: { bg: '#0a0908', panel: '#141110', accent: '#c89a6a', alert: '#e0604c' },
  graphite: { bg: '#0a0c10', panel: '#12161d', accent: '#5b9dff', alert: '#f0605a' },
  emerald: { bg: '#070b09', panel: '#0f1612', accent: '#3ecf8e', alert: '#ef5f55' },
  violet: { bg: '#0b0a10', panel: '#15131d', accent: '#a78bfa', alert: '#f25f7a' }
}
