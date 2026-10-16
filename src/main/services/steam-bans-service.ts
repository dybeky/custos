import { z } from 'zod'
import type { SteamBansResult } from '../../shared/types'

const REQUEST_TIMEOUT_MS = 8000
const MAX_IDS = 10
const STEAM_ID = /^7656119\d{10}$/

const BanSchema = z.object({
  steamId: z.string().regex(STEAM_ID),
  vacBans: z.number().int().min(0).nullable(),
  gameBans: z.number().int().min(0).nullable(),
  daysSinceLastBan: z.number().int().min(0).nullable(),
  vacBanned: z.boolean(),
  communityBanned: z.boolean().nullable(),
  economyBan: z.string().max(24).nullable()
})
const ResponseSchema = z.object({ bans: z.array(BanSchema).max(MAX_IDS), exact: z.boolean() })

/**
 * What the window may ask for. More accounts than the site answers for are
 * allowed (a PC with many logins): `get` asks for the first ones only.
 */
export const SteamIdsSchema = z.array(z.string().regex(/^\d{17}$/)).max(200)

/**
 * VAC and game bans of the Steam accounts found on the checked PC, asked from
 * the site (which asks Steam; the Steam key stays on the server). Only the
 * SteamIDs of the accounts leave the PC. Never throws: no site, no answer.
 */
export class SteamBansService {
  constructor(
    private deps: {
      /** Site origin, e.g. https://97437.dev. */
      baseUrl: string
      fetchImpl?: typeof fetch
    }
  ) {}

  async get(ids: string[]): Promise<SteamBansResult> {
    const wanted = [...new Set(ids.filter((i) => STEAM_ID.test(i)))].slice(0, MAX_IDS)
    if (wanted.length === 0) return { ok: true, exact: true, bans: [] }
    try {
      const url = new URL('/api/desktop/steam-bans', this.deps.baseUrl)
      url.searchParams.set('ids', wanted.join(','))
      const res = await (this.deps.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!res.ok) return { ok: false, exact: false, bans: [] }
      const parsed = ResponseSchema.safeParse(await res.json())
      if (!parsed.success) return { ok: false, exact: false, bans: [] }
      return { ok: true, exact: parsed.data.exact, bans: parsed.data.bans }
    } catch {
      return { ok: false, exact: false, bans: [] }
    }
  }
}
