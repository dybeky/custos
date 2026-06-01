/**
 * Shared locale constant for forensic date/time output.
 * Kept consistent across all scanners so reports look the same regardless
 * of the OS display language on the target machine.
 */
export const DISPLAY_LOCALE = 'en-GB'

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}

/**
 * Format a Date for forensic display output.
 * Always uses DISPLAY_LOCALE so output is locale-independent.
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleString(DISPLAY_LOCALE, DATE_FORMAT_OPTIONS)
}
