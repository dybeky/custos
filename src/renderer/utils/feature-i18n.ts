import type { TFunction } from 'i18next'
import { SCANNER_DISPLAY_TO_ID } from '../../shared/scanners-meta'

/**
 * Scan results identify scanners by their English display name (the IPC
 * contract), so map those names back to the stable ids used as i18n keys
 * (features.<id>.name/desc/help).
 */
/** @deprecated alias — use SCANNER_DISPLAY_TO_ID. Kept so existing imports compile. */
export const SCANNER_NAME_TO_ID = SCANNER_DISPLAY_TO_ID

/** Localized display name for a feature/scanner id, falling back to `fallback`. */
export function featureName(t: TFunction, id: string, fallback: string): string {
  return t(`features.${id}.name`, { defaultValue: fallback })
}

/** Localized one-line description for a feature/scanner id. */
export function featureDesc(t: TFunction, id: string, fallback: string): string {
  return t(`features.${id}.desc`, { defaultValue: fallback })
}

/** Localized long explanation (tooltip body) for a feature/scanner id. */
export function featureHelp(t: TFunction, id: string, fallback = ''): string {
  return t(`features.${id}.help`, { defaultValue: fallback })
}

/** Localized display name for a live-scan detector id. */
export function detectorName(t: TFunction, id: string, fallback: string): string {
  return t(`detectors.${id}.name`, { defaultValue: fallback })
}

/** Localized explanation for a live-scan detector id. */
export function detectorHelp(t: TFunction, id: string, fallback = ''): string {
  return t(`detectors.${id}.help`, { defaultValue: fallback })
}
