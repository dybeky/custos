import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/Card'
import { CustosMark } from '../ui/CustosMark'
import { useSettingsStore } from '../../stores/settings-store'
import { CREDITS, COPYRIGHT } from '../../../shared/credits'
import { playClick } from '../../utils/ui-sound'

/** Settings → About: who made Custos, the version, and where official builds live. */
export function AboutCard() {
  const { t } = useTranslation()
  const version = useSettingsStore((s) => s.version)
  const open = (url: string) => {
    playClick()
    window.electronAPI.openExternal(url)
  }

  return (
    <Card className="mb-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(var(--glow),.18), transparent 70%)' }}
      />
      <CardContent className="relative">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center bg-panel-2 border border-[color:var(--line-strong)] shadow-[0_0_28px_-8px_rgba(var(--glow),.6)]">
            <CustosMark className="w-8 h-8" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-ink-dim">{t('settings.about.title')}</p>
            <p className="mt-0.5 text-lg font-bold text-ink font-display">
              Custos <span className="text-ink-dim font-medium text-sm">v{version || '—'}</span>
            </p>
            <p className="text-sm text-ink-dim">
              {t('settings.about.madeBy')}{' '}
              <span className="font-semibold text-scan text-glow">{CREDITS.author}</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => open(CREDITS.repoUrl)}
            className="h-8 px-3 rounded-lg bg-panel-2 border border-[color:var(--line)] text-xs font-medium text-ink hover:border-[color:var(--line-strong)] transition-colors"
          >
            GitHub
          </button>
          <button
            onClick={() => open(CREDITS.releasesUrl)}
            className="h-8 px-3 rounded-lg bg-panel-2 border border-[color:var(--line)] text-xs font-medium text-ink hover:border-[color:var(--line-strong)] transition-colors"
          >
            {t('settings.about.officialBuilds')}
          </button>
          <button
            onClick={() => open(CREDITS.licenseUrl)}
            className="h-8 px-3 rounded-lg bg-panel-2 border border-[color:var(--line)] text-xs font-medium text-ink hover:border-[color:var(--line-strong)] transition-colors"
          >
            {t('settings.about.license')}
          </button>
        </div>

        <p className="mt-4 pt-3 border-t border-[color:var(--line)] text-[11px] leading-relaxed text-ink-dim">
          {COPYRIGHT} {t('settings.about.notice')}
        </p>
      </CardContent>
    </Card>
  )
}
