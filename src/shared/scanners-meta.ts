import type { ScannerName } from './types'

/**
 * Scan results identify scanners by their English display name (the IPC
 * contract). This canonical map resolves those names to the stable ids used by
 * the risk engine, capability service, and i18n keys.
 */
export const SCANNER_DISPLAY_TO_ID: Record<string, ScannerName> = {
  'AppData Scanner': 'appdata',
  'Prefetch Scanner': 'prefetch',
  'Recent Files Scanner': 'recentfiles',
  'Game Folder Scanner': 'gamefolder',
  'Registry Scanner': 'registry',
  'Browser History Scanner': 'browserhistory',
  'Process Scanner': 'process',
  'Steam Scanner': 'steam',
  'Amcache Scanner': 'amcache',
  'BAM/DAM Scanner': 'bam',
  'Shellbags Scanner': 'shellbags',
  'VM Scanner': 'vm',
  'DNS Cache Scanner': 'dnscache',
  'Scheduled Tasks Scanner': 'scheduledtasks',
  'File Hash Scanner': 'filehash',
  'Window & Module Scanner': 'windowmodule'
}

export function scannerIdFromDisplayName(name: string): ScannerName | null {
  return SCANNER_DISPLAY_TO_ID[name] ?? null
}
