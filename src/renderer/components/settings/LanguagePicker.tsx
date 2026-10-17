import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, isLanguage, setLanguage } from '../../i18n'
import { radioGroupKeys } from '../../utils/radio-keys'

/**
 * English / Русский. Applies at once: the highlight slides to the chosen
 * language and every string in the window changes without a restart.
 */
export function LanguagePicker() {
  const { t, i18n } = useTranslation()
  const current = isLanguage(i18n.language) ? i18n.language : 'en'
  const keys = radioGroupKeys(LANGUAGES, current, setLanguage)

  return (
    <div
      role="radiogroup"
      aria-label={t('settings.language.title')}
      onKeyDown={keys.onKeyDown}
      className="grid grid-cols-2 gap-1 rounded-xl border border-[color:var(--line)] bg-panel-2 p-1"
    >
      {LANGUAGES.map((lang) => {
        const active = lang === current
        return (
          <button
            key={lang}
            role="radio"
            aria-checked={active}
            tabIndex={keys.tabIndexOf(lang)}
            onClick={() => setLanguage(lang)}
            className={`relative flex items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-1 focus-visible:ring-scan/60 ${
              active ? 'text-scan' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId="language-thumb"
                className="absolute inset-0 rounded-lg border border-scan/40 bg-scan/10"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span
              className={`relative rounded-md px-1.5 py-px text-2xs font-bold uppercase tracking-wider ${
                active ? 'bg-scan text-on-accent' : 'bg-ink-dim/15 text-ink-dim'
              }`}
            >
              {lang}
            </span>
            <span className="relative">{t(`settings.language.${lang}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
