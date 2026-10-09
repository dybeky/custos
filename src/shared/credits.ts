/**
 * Authorship of Custos. Shown in Settings → About and on the launch screen,
 * and required by the LICENSE (§2c: these notices may not be removed or
 * changed). credits.test.ts fails the build if they go missing.
 */
export const CREDITS = {
  author: 'dybeky',
  legalName: 'Paulus Platov',
  year: 2026,
  repoUrl: 'https://github.com/dybeky/custos',
  releasesUrl: 'https://github.com/dybeky/custos/releases',
  licenseUrl: 'https://github.com/dybeky/custos/blob/main/LICENSE'
} as const

export const COPYRIGHT = `© ${CREDITS.year} ${CREDITS.author} (${CREDITS.legalName}). All rights reserved.`
