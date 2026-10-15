import { z } from 'zod'
import type { NewsFeed, NewsItem } from '../../shared/types'

const REQUEST_TIMEOUT_MS = 10_000
const FRESH_MS = 10 * 60 * 1000
const MAX_BYTES = 200_000

const ItemSchema = z.object({
  id: z.string().max(64),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tag: z.enum(['pro', 'free', 'site']),
  // A bad value here must not blank the whole feed: fall back to the preset.
  tagLabel: z.string().min(1).max(24).nullable().optional().catch(null),
  tagColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional()
    .catch(null),
  pinned: z.boolean().optional().catch(false),
  title: z.string().max(200),
  summary: z.string().max(600)
})
const FeedSchema = z.object({ items: z.array(ItemSchema).max(20) })

/**
 * The site's announcements (97437.dev/api/news), shown in the news card on the
 * Dashboard. The request carries no identifier. Never throws: with no network
 * the card simply shows the last news it had, or nothing.
 */
export class NewsService {
  private items: NewsItem[] = []
  private fetchedAt = 0
  private inFlight: Promise<NewsFeed> | null = null

  constructor(
    private deps: {
      /** Site origin, e.g. https://97437.dev. */
      baseUrl: string
      appVersion: string
      fetchImpl?: typeof fetch
      now?: () => number
    }
  ) {}

  private get url(): string {
    return new URL('/news', this.deps.baseUrl).toString()
  }

  get(): Promise<NewsFeed> {
    const now = (this.deps.now ?? Date.now)()
    if (this.items.length > 0 && now - this.fetchedAt < FRESH_MS) {
      return Promise.resolve({ items: this.items, url: this.url })
    }
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null
    })
    return this.inFlight
  }

  private async load(): Promise<NewsFeed> {
    try {
      const res = await (this.deps.fetchImpl ?? fetch)(new URL('/api/news', this.deps.baseUrl), {
        headers: { 'user-agent': `Custos/${this.deps.appVersion}`, accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (res.ok) {
        const text = await res.text()
        if (text.length <= MAX_BYTES) {
          const parsed = FeedSchema.safeParse(JSON.parse(text))
          if (parsed.success) {
            this.items = parsed.data.items
            this.fetchedAt = (this.deps.now ?? Date.now)()
          }
        }
      }
    } catch {
      // offline, timeout or malformed answer: keep what we had
    }
    return { items: this.items, url: this.url }
  }
}
