import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { NewsFeed } from '../../shared/types'
import { Card, CardContent } from './ui/Card'

const SHOWN = 3
type Lang = 'en' | 'ru'

/** The look of a chip in the author's own colour (#rrggbb). */
function chipStyle(hex: string): { color: string; borderColor: string; backgroundColor: string } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    color: hex,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.1)`
  }
}

/** EN | RU: the highlight slides to the chosen language. */
function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const { t } = useTranslation()
  const next: Lang = lang === 'en' ? 'ru' : 'en'
  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label={t('settings.language.title')}
        className="relative inline-flex rounded-full border border-[color:var(--line)] bg-panel-2 p-0.5"
      >
        {(['en', 'ru'] as const).map((l) => (
          <button
            key={l}
            aria-pressed={lang === l}
            onClick={() => onChange(l)}
            className={`relative min-w-9 rounded-full px-2.5 py-0.5 text-2xs font-semibold uppercase transition-colors ${
              lang === l ? 'text-scan' : 'text-ink-dim hover:text-ink'
            }`}
          >
            {lang === l && (
              <motion.span
                layoutId="news-lang-thumb"
                className="absolute inset-0 rounded-full border border-scan/40 bg-scan/15"
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
              />
            )}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onChange(next)}
        className="hidden text-2xs text-ink-dim hover:text-ink sm:inline"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={next}
            className="inline-block"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {next === 'ru' ? t('news.showRu') : t('news.showEn')}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  )
}

/**
 * The site's news (97437.dev/news) on the Dashboard: the same announcements in
 * the free Custos and in Custos Pro, in the app's language, with a switch to read
 * them in the other one. Hidden while there is nothing to show (offline, or the
 * site has no news).
 */
export function NewsCard() {
  const { t, i18n } = useTranslation()
  const [feed, setFeed] = useState<NewsFeed | null>(null)
  // null = follow the app's language until the reader picks one here.
  const [picked, setPicked] = useState<Lang | null>(null)

  useEffect(() => {
    let alive = true
    window.electronAPI
      .getNews()
      .then((f) => alive && setFeed(f))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!feed || feed.items.length === 0) return null

  const hasRu = feed.items.some((n) => n.ru)
  const lang: Lang = hasRu ? (picked ?? (i18n.language === 'ru' ? 'ru' : 'en')) : 'en'
  const tl = i18n.getFixedT(lang)

  return (
    <Card className="mb-4" transition={{ duration: 0.4, delay: 0.04 }}>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs font-semibold tracking-[0.22em] text-ink-dim font-display">
            {t('news.title')}
          </p>
          <div className="flex items-center gap-3">
            {hasRu && <LangSwitch lang={lang} onChange={setPicked} />}
            <button
              onClick={() => window.electronAPI.openExternal(feed.url)}
              className="text-xs font-semibold text-scan hover:underline"
            >
              {t('news.more')}
            </button>
          </div>
        </div>
        <ul className="mt-3 space-y-3">
          {feed.items.slice(0, SHOWN).map((n) => {
            const text = lang === 'ru' && n.ru ? n.ru : n
            return (
              <motion.li
                key={`${n.id}-${lang}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${n.tagColor ? '' : 'border-scan/40 bg-scan/10 text-scan'}`}
                    style={n.tagColor ? chipStyle(n.tagColor) : undefined}
                  >
                    {n.tagLabel || tl(`news.tag.${n.tag}`)}
                  </span>
                  <time dateTime={n.date} className="text-2xs text-ink-dim">
                    {new Date(`${n.date}T00:00:00Z`).toLocaleDateString(
                      lang === 'ru' ? 'ru-RU' : 'en-GB',
                      {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC'
                      }
                    )}
                  </time>
                </div>
                <p className="mt-1 text-sm font-semibold text-ink">{text.title}</p>
                <p className="mt-0.5 text-xs text-ink-dim">{text.summary}</p>
              </motion.li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
