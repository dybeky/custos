import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useScanStore } from '../stores/scan-store'
import { useSettingsStore } from '../stores/settings-store'
import { useGameStore } from '../stores/game-store'
import { useAuthStore } from '../stores/auth-store'
import { MODERN_NAV } from './nav'
import { buildJsonReport, buildTextReport, downloadText, exportFileStem } from '../utils/report-export'

export interface Command {
  id: string
  group: 'actions' | 'navigate' | 'preferences'
  label: string
  /** Extra words the fuzzy filter should match (other language, synonyms). */
  keywords?: string
  shortcut?: string
  run: () => void
}

/** Case-insensitive subsequence match: "exp tx" matches "Export TXT". */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return true
  const s = text.toLowerCase()
  let i = 0
  for (const ch of s) {
    if (ch === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

/** Export the current report as TXT or JSON (shared by palette and shortcuts). */
export function useExportReport(): (kind: 'txt' | 'json') => boolean {
  const { t, i18n } = useTranslation()
  const { report, results, caseInfo } = useScanStore()
  const checker = useAuthStore((s) => s.user?.username)
  return (kind) => {
    if (results.length === 0) return false
    const caseDetails = { ...caseInfo, checkedBy: checker }
    const stem = exportFileStem(report)
    if (kind === 'txt') downloadText(buildTextReport(t, report, results, i18n.language, caseDetails), `${stem}.txt`, 'text/plain')
    else downloadText(buildJsonReport(report, results, new Date(), caseDetails), `${stem}.json`, 'application/json')
    return true
  }
}

/** Every command available in the modern shell, given the current state. */
export function useModernCommands(): Command[] {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status, results, startScan, cancelScan } = useScanStore()
  const { language, setLanguage, setUiMode } = useSettingsStore()
  const { selectedGame } = useGameStore()
  const exportReport = useExportReport()

  const cmds: Command[] = []

  if (status === 'scanning') {
    cmds.push({ id: 'cancel', group: 'actions', label: t('modern.cmd.cancel'), keywords: 'stop cancel стоп', run: () => void cancelScan() })
  } else {
    cmds.push({
      id: 'start', group: 'actions', label: status === 'idle' ? t('modern.cmd.start') : t('modern.cmd.rescan'),
      keywords: 'scan start check проверка скан', shortcut: 'Ctrl Enter',
      run: () => { navigate('/'); void startScan(selectedGame ?? undefined) }
    })
  }
  if (results.length > 0 && status !== 'scanning') {
    cmds.push(
      { id: 'export-txt', group: 'actions', label: t('modern.cmd.exportTxt'), keywords: 'export report txt экспорт отчёт', shortcut: 'Ctrl E', run: () => void exportReport('txt') },
      { id: 'export-json', group: 'actions', label: t('modern.cmd.exportJson'), keywords: 'export json экспорт', run: () => void exportReport('json') }
    )
  }

  for (const item of MODERN_NAV) {
    cmds.push({ id: `go-${item.key}`, group: 'navigate', label: t(`modern.nav.${item.key}`), keywords: item.key, run: () => navigate(item.path) })
  }
  cmds.push(
    { id: 'go-settings', group: 'navigate', label: t('nav.settings'), keywords: 'settings настройки', run: () => navigate('/settings') },
    { id: 'go-profile', group: 'navigate', label: t('modern.cmd.profile'), keywords: 'profile account профиль', run: () => navigate('/profile') }
  )

  cmds.push(
    {
      id: 'lang', group: 'preferences',
      label: language === 'ru' ? 'Switch to English' : 'Переключить на русский',
      keywords: 'language язык english русский',
      run: () => setLanguage(language === 'ru' ? 'en' : 'ru')
    },
    { id: 'classic', group: 'preferences', label: t('modern.cmd.classic'), keywords: 'classic interface ui классический интерфейс', run: () => setUiMode('classic') }
  )
  return cmds
}
