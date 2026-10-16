import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'

export const LANGUAGES = ['en', 'ru'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'custos-lang'

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** The saved choice, else the system language (Russian or English). */
export function detectLanguage(): Language {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // storage unavailable — fall through to the system language
  }
  const system = typeof navigator !== 'undefined' ? navigator.language : ''
  return /^ru\b/i.test(system) ? 'ru' : 'en'
}

function applyDocumentLanguage(lang: Language): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

/** Switch the interface language and remember it. */
export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang)
  applyDocumentLanguage(lang)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang)
  } catch {
    // the choice still applies for this session
  }
}

const initial = detectLanguage()
applyDocumentLanguage(initial)

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru }
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
})

export default i18n
