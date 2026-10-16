import { redactSecrets } from '../utils/redact'

/**
 * Sends errors and crashes to the site (97437.dev → Crashes in the admin panel)
 * so they can be fixed. Built to be harmless to the checked PC:
 *  - nothing is stored here: a report is sent once, right away, or dropped;
 *  - it carries the error, the app version and the system, never check results,
 *    player names or findings;
 *  - Windows account names in paths, e-mails and secrets are removed BEFORE
 *    anything leaves the PC (the site strips them again);
 *  - it never throws, never waits for the site and sends the same error once.
 */

export type CrashKind =
  | 'main_exception'
  | 'main_rejection'
  | 'renderer_error'
  | 'renderer_gone'
  | 'child_gone'
  | 'scanner_error'
  | 'other'

export interface CrashContext {
  os?: string
  osBuild?: string
  arch?: string
  electron?: string
  locale?: string
  game?: string
  scanner?: string
  process?: string
  uptimeSec?: number
}

const MAX_MESSAGE = 1500
const MAX_STACK = 8000
const REQUEST_TIMEOUT_MS = 5000

const USER_PATH = /([A-Za-z]:)?[\\/]+Users[\\/]+[^\\/"'<>|:*?\r\n]+/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const LONG_HEX = /\b[0-9a-fA-F]{32,}\b/g
const STEAM_ID = /\b7656119\d{10}\b/g
const BEARER = /\bBearer\s+\S+/gi

/** Strips what identifies a person from text that is about to leave the PC. */
export function redactForReport(text: string): string {
  return redactSecrets(text)
    .replace(USER_PATH, (m) => (/^[A-Za-z]:/.test(m) ? 'C:\\Users\\<user>' : '\\Users\\<user>'))
    .replace(EMAIL, '<email>')
    .replace(BEARER, 'Bearer <hidden>')
    .replace(LONG_HEX, '<hex>')
    .replace(STEAM_ID, '<steamid>')
}

/** Message and stack of anything that was thrown. */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`.slice(0, MAX_MESSAGE * 2), stack: error.stack }
  }
  if (typeof error === 'string') return { message: error }
  // an error already described elsewhere (the window sends message and stack)
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    const o = error as { message: string; stack?: unknown }
    return { message: o.message, ...(typeof o.stack === 'string' && o.stack ? { stack: o.stack } : {}) }
  }
  try {
    return { message: JSON.stringify(error) ?? String(error) }
  } catch {
    return { message: String(error) }
  }
}

export interface CrashReporterDeps {
  /** Site origin, e.g. https://97437.dev. */
  baseUrl: string
  app: 'custos' | 'pro'
  appVersion: string
  /** Whether sending is allowed right now (the Settings switch, the opt-out flags). */
  enabled: () => boolean
  /** System facts attached to every report. */
  context: () => CrashContext
  /** POSTs the body; resolves when the request was made. Never needs to throw. */
  send: (url: string, body: string) => Promise<void>
  /** Reports allowed per launch (a crash loop must not flood the site). */
  maxPerSession?: number
  uptime?: () => number
}

export class CrashReporter {
  private seen = new Set<string>()
  private sent = 0

  constructor(private deps: CrashReporterDeps) {}

  private get url(): string {
    return new URL('/api/desktop/crash', this.deps.baseUrl).toString()
  }

  /** Reports one error. Resolves when done; never rejects. */
  async report(kind: CrashKind, error: unknown, extra: CrashContext = {}): Promise<void> {
    try {
      if (!this.deps.enabled()) return
      const { message: rawMessage, stack: rawStack } = describeError(error)
      const message = redactForReport(rawMessage).trim().slice(0, MAX_MESSAGE)
      if (!message) return
      // The same error is sent once per launch: numbers and quoted values do not count.
      const key = `${kind}|${extra.scanner ?? ''}|${message.split('\n')[0].replace(/\d+/g, '#').replace(/(['"]).*?\1/g, '$1…$1')}`
      if (this.seen.has(key)) return
      if (this.sent >= (this.deps.maxPerSession ?? 10)) return
      this.seen.add(key)
      this.sent++

      const context: CrashContext = {
        ...this.deps.context(),
        ...extra,
        uptimeSec: Math.round((this.deps.uptime ?? (() => process.uptime()))())
      }
      const body = JSON.stringify({
        app: this.deps.app,
        appVersion: this.deps.appVersion,
        kind,
        message,
        ...(rawStack ? { stack: redactForReport(rawStack).slice(0, MAX_STACK) } : {}),
        context: Object.fromEntries(
          Object.entries(context)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => [k, typeof v === 'string' ? redactForReport(v).slice(0, 80) : v])
        )
      })
      await this.deps.send(this.url, body)
    } catch {
      // reporting must never cause a problem of its own
    }
  }
}

/** POST with a timeout through the given fetch (Electron's net.fetch survives a blocked main thread). */
export function postJson(fetchImpl: typeof fetch): (url: string, body: string) => Promise<void> {
  return async (url, body) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal
      })
    } catch {
      // offline or blocked: the report is dropped, nothing is kept
    } finally {
      clearTimeout(timer)
    }
  }
}

let instance: CrashReporter | null = null

/** Wires the process-wide reporter; call once from main. */
export function initCrashReporter(deps: CrashReporterDeps): CrashReporter {
  instance = new CrashReporter(deps)
  return instance
}

/** Fire-and-forget; a no-op until initCrashReporter has run. */
export function reportCrash(kind: CrashKind, error: unknown, extra?: CrashContext): Promise<void> {
  return instance ? instance.report(kind, error, extra) : Promise.resolve()
}
