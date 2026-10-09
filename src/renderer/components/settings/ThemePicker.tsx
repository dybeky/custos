import { useTranslation } from 'react-i18next'
import { COLOR_THEMES, THEME_SWATCHES } from '../../../shared/themes'
import { useSettingsStore } from '../../stores/settings-store'

/**
 * Theme tiles, each a miniature of the app in that theme (background,
 * panel, accent button, alert chip). Selecting one recolors the app at once.
 */
export function ThemePicker() {
  const { t } = useTranslation()
  const { colorTheme, setColorTheme } = useSettingsStore()

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" role="radiogroup" aria-label={t('settings.theme.title')}>
      {COLOR_THEMES.map((id) => {
        const sw = THEME_SWATCHES[id]
        const active = colorTheme === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            onClick={() => setColorTheme(id)}
            className={`text-left rounded-2xl p-2 border transition-colors ${
              active ? 'border-scan bg-scan/[0.06]' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
            }`}
          >
            <div className="h-20 rounded-xl overflow-hidden border border-white/5 p-2 flex flex-col gap-1.5" style={{ background: sw.bg }}>
              <div className="flex gap-1.5 flex-1">
                <div className="w-1/3 rounded-md" style={{ background: sw.panel }} />
                <div className="flex-1 rounded-md p-1.5 flex flex-col gap-1" style={{ background: sw.panel }}>
                  <span className="h-1 w-2/3 rounded-full" style={{ background: sw.alert, opacity: 0.8 }} />
                  <span className="h-1 w-1/2 rounded-full bg-white/15" />
                  <span className="h-1 w-3/4 rounded-full bg-white/10" />
                </div>
              </div>
              <span className="h-2.5 w-12 rounded-full" style={{ background: sw.accent }} />
            </div>
            <div className="px-1 pt-2 flex items-start gap-2">
              <span
                className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${active ? 'border-scan bg-scan shadow-[inset_0_0_0_2px_var(--bg)]' : 'border-ink-dim/50'}`}
              />
              <span>
                <span className="block text-sm font-medium text-ink">{t(`settings.theme.${id}`)}</span>
                <span className="block mt-0.5 text-[11px] leading-snug text-ink-dim">{t(`settings.theme.${id}Desc`)}</span>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
