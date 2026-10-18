import { z } from 'zod'
import { redactForReport } from './crash-reporter'
import type { ProblemReportResult } from '../../shared/types'

const REQUEST_TIMEOUT_MS = 10_000

/** What the window may send: free text from the person plus names (never results) of scanners. */
const ProblemPayloadSchema = z.object({
  kind: z.enum(['app', 'scanner', 'other']),
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().min(10).max(2000),
  contact: z.string().trim().max(120).optional(),
  page: z.string().max(24).optional(),
  game: z.string().max(16).optional(),
  failedScanners: z.array(z.string().max(40)).max(30).optional(),
  scanners: z.array(z.string().max(40)).max(30).optional()
}).strict()

/**
 * "Report a problem": a person describes what went wrong and it goes to the
 * site's Reports tab. Only what they wrote, the app version, the system and the
 * names of scanners leave the PC; check results, player names and findings never
 * do, and Windows account names, e-mails and secrets are cut out of the text.
 */
export class ProblemReportService {
  constructor(
    private deps: {
      /** Site origin, e.g. https://97437.dev. */
      baseUrl: string
      appVersion: string
      system: () => { os?: string; osBuild?: string; arch?: string; locale?: string }
      fetchImpl?: typeof fetch
    }
  ) {}

  async send(raw: unknown): Promise<ProblemReportResult> {
    const parsed = ProblemPayloadSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'invalid' }
    const p = parsed.data
    const clean = (s: string): string => redactForReport(s).slice(0, 2000)
    const sys = this.deps.system()
    const context = Object.fromEntries(
      Object.entries({
        os: sys.os, osBuild: sys.osBuild, arch: sys.arch, locale: sys.locale,
        game: p.game, page: p.page,
        failedScanners: p.failedScanners?.map(clean), scanners: p.scanners?.map(clean)
      }).filter(([, v]) => v !== undefined && v !== '')
    )
    const body = JSON.stringify({
      app: 'custos',
      appVersion: this.deps.appVersion,
      kind: p.kind,
      title: clean(p.title).slice(0, 120),
      details: clean(p.details),
      ...(p.contact ? { contact: clean(p.contact).slice(0, 120) } : {}),
      context
    })
    try {
      const res = await (this.deps.fetchImpl ?? fetch)(new URL('/api/desktop/problem', this.deps.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': `Custos/${this.deps.appVersion}` },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
      if (res.ok) return { ok: true }
      return { ok: false, error: res.status === 429 ? 'rate_limited' : 'failed' }
    } catch {
      return { ok: false, error: 'failed' }
    }
  }
}
