import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NewsFeed } from '../../shared/types'
import { Card, CardContent } from './ui/Card'

const SHOWN = 3

/**
 * The site's news (97437.dev/news) on the Dashboard: the same announcements in
 * the free Custos and in Custos Pro. Hidden while there is nothing to show
 * (offline, or the site has no news).
 */
export function NewsCard() {
  const { t } = useTranslation()
  const [feed, setFeed] = useState<NewsFeed | null>(null)

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

  return (
    <Card className="mb-4" transition={{ duration: 0.4, delay: 0.04 }}>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs font-semibold tracking-[0.22em] text-ink-dim font-display">
            {t('news.title')}
          </p>
          <button
            onClick={() => window.electronAPI.openExternal(feed.url)}
            className="text-xs font-semibold text-scan hover:underline"
          >
            {t('news.more')}
          </button>
        </div>
        <ul className="mt-3 space-y-3">
          {feed.items.slice(0, SHOWN).map((n) => (
            <li key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-scan/40 bg-scan/10 px-2 py-0.5 text-2xs font-semibold text-scan">
                  {t(`news.tag.${n.tag}`)}
                </span>
                <time dateTime={n.date} className="text-2xs text-ink-dim">
                  {new Date(`${n.date}T00:00:00Z`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC'
                  })}
                </time>
              </div>
              <p className="mt-1 text-sm font-semibold text-ink">{n.title}</p>
              <p className="mt-0.5 text-xs text-ink-dim">{n.summary}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
