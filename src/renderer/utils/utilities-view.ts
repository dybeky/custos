/**
 * The tools on the Utilities page: third-party programs a checker downloads from
 * their authors' own sites. The app only opens the site in the browser; it never
 * downloads or runs any of them.
 */

export type UtilityGroup = 'traces' | 'devices' | 'processes'

export interface UtilityDef {
  /** Slug of the i18n keys utilities.why.<slug> and utilities.how.<slug>. */
  slug: string
  name: string
  /** Capability/feature id: keys the InfoTip explanation (features.<id>.help). */
  featureId: string
  descKey: string
  url: string
  group: UtilityGroup
}

export const UTILITY_GROUPS: UtilityGroup[] = ['traces', 'devices', 'processes']

export const UTILITIES: UtilityDef[] = [
  {
    slug: 'lastActivityView',
    name: 'LastActivityView',
    featureId: 'tool-lastactivityview',
    descKey: 'utilities.lastActivityViewDesc',
    url: 'https://www.nirsoft.net/utils/computer_activity_view.html',
    group: 'traces'
  },
  {
    slug: 'shellbagAnalyzer',
    name: 'ShellBag Analyzer & Cleaner',
    featureId: 'tool-shellbaganalyzer',
    descKey: 'utilities.shellbagAnalyzerDesc',
    url: 'https://privazer.com/en/download-shellbag-analyzer-shellbag-cleaner.php',
    group: 'traces'
  },
  {
    slug: 'usbDeview',
    name: 'USBDeview',
    featureId: 'tool-usbdeview',
    descKey: 'utilities.usbDeviewDesc',
    url: 'https://www.nirsoft.net/utils/usb_devices_view.html',
    group: 'devices'
  },
  {
    slug: 'everything',
    name: 'Everything',
    featureId: 'tool-everything',
    descKey: 'utilities.everythingDesc',
    url: 'https://www.voidtools.com/',
    group: 'devices'
  },
  {
    slug: 'systemInformer',
    name: 'System Informer',
    featureId: 'tool-systeminformer',
    descKey: 'utilities.systemInformerDesc',
    url: 'https://systeminformer.sourceforge.io/',
    group: 'processes'
  }
]

/** The site's host without "www.", shown on the card so the checker sees where the link goes. */
export function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Tools of a tab ('all' keeps every one) whose name, texts or site contain the search words. */
export function filterUtilities(
  tab: UtilityGroup | 'all',
  query: string,
  textOf: (u: UtilityDef) => string
): UtilityDef[] {
  const q = query.trim().toLowerCase()
  return UTILITIES.filter(
    (u) =>
      (tab === 'all' || u.group === tab) &&
      (!q || `${u.name} ${siteHost(u.url)} ${textOf(u)}`.toLowerCase().includes(q))
  )
}
