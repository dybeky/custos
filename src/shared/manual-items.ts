/**
 * What the Manual page can open, by category. Kept apart from the page (icons,
 * layout) so a test can check every target against the rules the main process
 * applies: allowed folders, valid registry keys, Steam sub-folders, https links.
 *
 * `labelKey` is an i18n key under manual.item — proper nouns (Steam, AppData,
 * Prefetch…) stay as plain `label`.
 */

export type ManualAction = 'path' | 'registry' | 'external' | 'steam'

export interface ManualItemDef {
  label: string
  labelKey?: string
  hint?: string
  target: string
  /** Overrides the category's action for this one item. */
  action?: ManualAction
}

const CS2 = 'Counter-Strike Global Offensive'

export const MANUAL_ITEMS = {
  systemTools: [
    { label: 'Data Usage', labelKey: 'manual.dataUsage', hint: 'ms-settings:datausage', target: 'ms-settings:datausage' },
    { label: 'Windows Defender', labelKey: 'manual.windowsDefender', hint: 'windowsdefender:', target: 'windowsdefender:' },
    { label: 'Installed apps', labelKey: 'manual.item.installedApps', hint: 'ms-settings:appsfeatures', target: 'ms-settings:appsfeatures' },
    { label: 'Startup apps', labelKey: 'manual.item.startupApps', hint: 'ms-settings:startupapps', target: 'ms-settings:startupapps' }
  ],
  folders: [
    { label: 'Videos', labelKey: 'manual.videos', hint: '%USERPROFILE%\\Videos', target: '%USERPROFILE%\\Videos' },
    { label: 'Downloads', labelKey: 'manual.downloads', hint: '%USERPROFILE%\\Downloads', target: '%USERPROFILE%\\Downloads' },
    { label: 'Desktop', labelKey: 'manual.item.desktop', hint: '%USERPROFILE%\\Desktop', target: '%USERPROFILE%\\Desktop' },
    { label: 'Documents', labelKey: 'manual.item.documents', hint: '%USERPROFILE%\\Documents', target: '%USERPROFILE%\\Documents' },
    { label: 'Pictures', labelKey: 'manual.item.pictures', hint: '%USERPROFILE%\\Pictures', target: '%USERPROFILE%\\Pictures' },
    { label: 'Telegram downloads', labelKey: 'manual.item.telegramDownloads', hint: '%USERPROFILE%\\Downloads\\Telegram Desktop', target: '%USERPROFILE%\\Downloads\\Telegram Desktop' },
    { label: 'AppData', hint: '%APPDATA%', target: '%APPDATA%' },
    { label: 'LocalAppData', hint: '%LOCALAPPDATA%', target: '%LOCALAPPDATA%' },
    { label: 'Temp', labelKey: 'manual.item.temp', hint: '%TEMP%', target: '%TEMP%' },
    { label: 'ProgramData', hint: '%ProgramData%', target: '%ProgramData%' },
    { label: 'OneDrive', hint: '%USERPROFILE%\\OneDrive', target: '%USERPROFILE%\\OneDrive' }
  ],
  traces: [
    { label: 'Prefetch', hint: '%SystemRoot%\\Prefetch', target: '%SystemRoot%\\Prefetch' },
    { label: 'Recent files', labelKey: 'manual.item.recent', hint: '%APPDATA%\\Microsoft\\Windows\\Recent', target: '%APPDATA%\\Microsoft\\Windows\\Recent' },
    { label: 'Jump Lists', hint: '…\\Recent\\AutomaticDestinations', target: '%APPDATA%\\Microsoft\\Windows\\Recent\\AutomaticDestinations' },
    { label: 'Startup (this user)', labelKey: 'manual.item.startupUser', hint: '%APPDATA%\\…\\Start Menu\\Programs\\Startup', target: '%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup' },
    { label: 'Startup (all users)', labelKey: 'manual.item.startupAll', hint: '%ProgramData%\\…\\Programs\\Startup', target: '%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup' },
    { label: 'Scheduled tasks', labelKey: 'manual.item.tasks', hint: '%SystemRoot%\\System32\\Tasks', target: '%SystemRoot%\\System32\\Tasks' },
    { label: 'Event logs', labelKey: 'manual.item.eventLogs', hint: '%SystemRoot%\\System32\\winevt\\Logs', target: '%SystemRoot%\\System32\\winevt\\Logs' },
    { label: 'Amcache', hint: '%SystemRoot%\\AppCompat\\Programs', target: '%SystemRoot%\\AppCompat\\Programs' },
    { label: 'Crash dumps', labelKey: 'manual.item.crashDumps', hint: '%LOCALAPPDATA%\\CrashDumps', target: '%LOCALAPPDATA%\\CrashDumps' },
    { label: 'Error reports', labelKey: 'manual.item.errorReports', hint: '%ProgramData%\\Microsoft\\Windows\\WER', target: '%ProgramData%\\Microsoft\\Windows\\WER' },
    { label: 'Windows Temp', labelKey: 'manual.item.windowsTemp', hint: '%SystemRoot%\\Temp', target: '%SystemRoot%\\Temp' }
  ],
  games: [
    { label: 'Unturned', hint: 'Steam\\steamapps\\common\\Unturned', target: 'Unturned' },
    { label: 'Unturned logs', labelKey: 'manual.item.unturnedLogs', hint: 'Unturned\\Logs', target: 'Unturned/Logs' },
    { label: 'Unturned modules', labelKey: 'manual.item.unturnedModules', hint: 'Unturned\\Modules', target: 'Unturned/Modules' },
    { label: 'Counter-Strike 2', hint: `Steam\\steamapps\\common\\${CS2}`, target: CS2 },
    { label: 'CS2 configs', labelKey: 'manual.item.cs2Cfg', hint: 'game\\csgo\\cfg', target: `${CS2}/game/csgo/cfg` },
    { label: 'CS2 addons', labelKey: 'manual.item.cs2Addons', hint: 'game\\csgo\\addons', target: `${CS2}/game/csgo/addons` },
    { label: 'CS2 binaries', labelKey: 'manual.item.cs2Bin', hint: 'game\\bin\\win64', target: `${CS2}/game/bin/win64` },
    { label: 'Steam', hint: 'Steam', target: '' },
    { label: 'Steam accounts', labelKey: 'manual.item.steamUserdata', hint: 'Steam\\userdata', target: '@steam/userdata' },
    { label: 'Steam logins', labelKey: 'manual.item.steamConfig', hint: 'Steam\\config', target: '@steam/config' },
    { label: 'Steam logs', labelKey: 'manual.item.steamLogs', hint: 'Steam\\logs', target: '@steam/logs' }
  ] as ManualItemDef[],
  registry: [
    { label: 'MuiCache', target: 'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache' },
    { label: 'AppSwitched', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppSwitched' },
    { label: 'ShowJumpView', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\ShowJumpView' },
    { label: 'AppBadgeUpdated', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppBadgeUpdated' },
    { label: 'AppLaunch', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FeatureUsage\\AppLaunch' },
    { label: 'RunMRU', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU' },
    { label: 'UserAssist', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist' },
    { label: 'AppCompatFlags', target: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers' },
    { label: 'Compatibility Assistant', target: 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store' },
    { label: 'BAM', target: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings' },
    { label: 'ShimCache', target: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\AppCompatCache' },
    { label: 'OpenSavePidlMRU', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\OpenSavePidlMRU' },
    { label: 'LastVisitedPidlMRU', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\ComDlg32\\LastVisitedPidlMRU' },
    { label: 'RecentDocs', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs' },
    { label: 'TypedPaths', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths' },
    { label: 'ShellBags', target: 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\BagMRU' },
    { label: 'Run (this user)', target: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
    { label: 'Run (all users)', target: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run' },
    { label: 'Services', target: 'HKLM\\SYSTEM\\CurrentControlSet\\Services' },
    { label: 'Scheduled tasks', target: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\TaskCache\\Tree' },
    { label: 'Installed programs', target: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
    { label: 'Defender exclusions', target: 'HKLM\\SOFTWARE\\Microsoft\\Windows Defender\\Exclusions' },
    { label: 'USB storage', target: 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR' },
    { label: 'Steam', target: 'HKCU\\Software\\Valve\\Steam' }
  ],
  telegram: [
    { label: '@undeadsellerbot', target: 'https://t.me/undeadsellerbot' },
    { label: '@MelonySolutionBot', target: 'https://t.me/MelonySolutionBot' },
    { label: '@UndeadHacksbot', target: 'https://t.me/UndeadHacksbot' },
    { label: '@UndeadHacksru', target: 'https://t.me/UndeadHacksru' },
    { label: '@melonysolution', target: 'https://t.me/melonysolution' }
  ],
  resources: [
    { label: 'Oplata.info', hint: 'oplata.info', target: 'https://oplata.info' },
    { label: 'FunPay.com', hint: 'funpay.com', target: 'https://funpay.com' },
    { label: 'Plati.market', hint: 'plati.market', target: 'https://plati.market' },
    { label: 'GGsel', hint: 'ggsel.net', target: 'https://ggsel.net' },
    { label: 'Lolz Market', hint: 'lzt.market', target: 'https://lzt.market' }
  ]
} satisfies Record<string, ManualItemDef[]>

/** The i18n id of an item: its name in lower case, letters and digits only ("Run (this user)" → "run-this-user"). */
export function itemSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** "HKCU\…\Explorer\RunMRU": the hive and the last two names of a long registry key. */
export function shortRegistryKey(key: string): string {
  const parts = key.split('\\')
  if (parts.length <= 4) return key
  return `${parts[0]}\\…\\${parts.slice(-2).join('\\')}`
}
