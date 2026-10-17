import { useTranslation } from 'react-i18next'
import { COLOR_THEMES, THEME_SWATCHES } from '../../../shared/themes'
import { useSettingsStore } from '../../stores/settings-store'
import { radioGroupKeys } from '../../utils/radio-keys'

/**
 * Theme tiles, each a miniature of the app in that theme (background,
 * panel, accent button, alert chip). Selecting one recolors the app at once.
 */
export function ThemePicker() {
  const { t } = useTranslation()
  const { colorTheme, setColorTheme } = useSettingsStore()
  const keys = radioGroupKeys(COLOR_THEMES, colorTheme, setColorTheme)

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-3" role="radiogroup" aria-label={t('settings.theme.title')} onKeyDown={keys.onKeyDown}>
      {COLOR_THEMES.map((id) => {
        const sw = THEME_SWATCHES[id]
        const active = colorTheme === id
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            tabIndex={keys.tabIndexOf(id)}
            onClick={() => setColorTheme(id)}
            className={`group relative text-left rounded-2xl p-2 border outline-none transition-all duration-200 focus-visible:ring-1 focus-visible:ring-scan/60 ${
              active
                ? 'border-scan bg-scan/[0.06] shadow-[0_0_24px_-10px_rgba(var(--glow),.7)]'
                : 'border-[color:var(--line)] hover:-translate-y-0.5 hover:border-[color:var(--line-strong)]'
            }`}
          >
            <div className="relative h-20 rounded-xl overflow-hidden border border-white/5 p-2 flex flex-col gap-1.5" style={{ background: sw.bg }}>
              <div className="flex gap-1.5 flex-1">
                <div className="w-1/3 rounded-md" style={{ background: sw.panel }} />
                <div className="flex-1 rounded-md p-1.5 flex flex-col gap-1" style={{ background: sw.panel }}>
                  <span className="h-1 w-2/3 rounded-full" style={{ background: sw.alert, opacity: 0.8 }} />
                  <span className="h-1 w-1/2 rounded-full bg-white/15" />
                  <span className="h-1 w-3/4 rounded-full bg-white/10" />
                </div>
              </div>
              <span className="h-2.5 w-12 rounded-full" style={{ background: sw.accent }} />
              {active && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full"
                  style={{ background: sw.accent }}
                  aria-hidden
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke={sw.bg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
            </div>
            <div className="px-1 pt-2">
              <span className="block text-sm font-medium text-ink">{t(`settings.theme.${id}`)}</span>
              <span className="block mt-0.5 text-[11px] leading-snug text-ink-dim">{t(`settings.theme.${id}Desc`)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
