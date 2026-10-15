/** Dates read day, month, year with a 24-hour clock; the English UI gets en-GB, not en-US. */
export function dateLocale(locale?: string): string | undefined {
  return !locale || locale === 'en' ? 'en-GB' : locale
}
