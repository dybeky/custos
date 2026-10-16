import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, isLanguage, setLanguage } from '../../i18n'

/**
 * English / Русский. Applies at once: the highlight slides to the chosen
 * language and every string in the window changes without a restart.
 */
export function LanguagePicker() {
  const { t, i18n } = useTranslation()
  const current = isLanguage(i18n.language) ? i18n.language : 'en'

  return (
    <div>
      <p className="text-sm text-ink-dim mb-3">{t('settings.language.desc')}</p>
      <div role="radiogroup" aria-label={t('settings.language.title')} className="inline-flex rounded-xl border border-[color:var(--line)] bg-panel-2 p-1">
        {LANGUAGES.map((lang) => {
          const active = lang === current
          return (
            <button
              key={lang}
              role="radio"
              aria-checked={active}
              onClick={() => setLanguage(lang)}
              className={`relative min-w-32 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
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
              <span className="relative">{t(`settings.language.${lang}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
