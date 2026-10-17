import { describe, it, expect, vi } from 'vitest'
import { CrashReporter, describeError, redactForReport, postJson } from './crash-reporter'

const make = (over: Partial<ConstructorParameters<typeof CrashReporter>[0]> = {}) => {
  const sent: Array<{ url: string; body: Record<string, unknown> }> = []
  const reporter = new CrashReporter({
    baseUrl: 'https://97437.dev',
    app: 'custos',
    appVersion: '3.2.0',
    enabled: () => true,
    context: () => ({ os: 'Windows 11', arch: 'x64', electron: '42.0.0' }),
    send: async (url, body) => {
      sent.push({ url, body: JSON.parse(body) })
    },
    uptime: () => 12.4,
    ...over
  })
  return { reporter, sent }
}

describe('redactForReport', () => {
  it('removes account names, e-mails, secrets, hashes and SteamIDs', () => {
    expect(redactForReport('open C:\\Users\\Max Müller\\AppData\\x.js')).toBe('open C:\\Users\\<user>\\AppData\\x.js')
    expect(redactForReport('mail neo@example.com')).not.toContain('neo@')
    expect(redactForReport('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def')
    expect(redactForReport('hash ' + 'a'.repeat(64))).toBe('hash <hex>')
    expect(redactForReport('76561198012345678')).toBe('<steamid>')
  })

  it('hides account names behind network admin shares too (same rule as the site upload)', () => {
    expect(redactForReport('ENOENT \\\\PC\\C$\\Users\\Ivan\\AppData\\x.js')).not.toContain('Ivan')
    expect(redactForReport('at \\Device\\HarddiskVolume3\\Users\\Ivan\\x.js')).not.toContain('Ivan')
  })
})

describe('describeError', () => {
  it('reads an Error, a string and an odd value', () => {
    const e = new TypeError('bad')
    expect(describeError(e).message).toBe('TypeError: bad')
    expect(describeError(e).stack).toContain('TypeError')
    expect(describeError('plain').message).toBe('plain')
    expect(describeError({ a: 1 }).message).toBe('{"a":1}')
    expect(describeError({ message: 'RangeError: x', stack: 'at f' })).toEqual({ message: 'RangeError: x', stack: 'at f' })
  })
})

describe('CrashReporter', () => {
  it('sends the error with the app, version, system and uptime', async () => {
    const { reporter, sent } = make()
    await reporter.report('main_exception', new Error('boom'), { scanner: 'appdata' })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://97437.dev/api/desktop/crash')
    expect(sent[0].body).toMatchObject({
      app: 'custos',
      appVersion: '3.2.0',
      kind: 'main_exception',
      message: 'Error: boom',
      context: { os: 'Windows 11', arch: 'x64', scanner: 'appdata', uptimeSec: 12 }
    })
  })

  it('strips the account name from message and stack before sending', async () => {
    const { reporter, sent } = make()
    const e = new Error('ENOENT C:\\Users\\Anna\\x.txt')
    e.stack = 'Error: ENOENT\n    at f (C:\\Users\\Anna\\AppData\\app.js:1:1)'
    await reporter.report('main_exception', e)
    const text = JSON.stringify(sent[0].body)
    expect(text).not.toContain('Anna')
    expect(text).toContain('C:\\\\Users\\\\<user>')
  })

  it('sends the same error once per launch, numbers and quoted values aside', async () => {
    const { reporter, sent } = make()
    await reporter.report('scanner_error', "ENOENT 'a.txt' code 2", { scanner: 'x' })
    await reporter.report('scanner_error', "ENOENT 'b.txt' code 9", { scanner: 'x' })
    await reporter.report('scanner_error', "ENOENT 'a.txt' code 2", { scanner: 'y' })
    expect(sent).toHaveLength(2)
  })

  it('stops after the limit so a crash loop cannot flood the site', async () => {
    const { reporter, sent } = make({ maxPerSession: 3 })
    for (let i = 0; i < 8; i++) await reporter.report('other', `distinct error ${'x'.repeat(i)}`)
    expect(sent).toHaveLength(3)
  })

  it('sends nothing when reports are switched off', async () => {
    const { reporter, sent } = make({ enabled: () => false })
    await reporter.report('main_exception', new Error('x'))
    expect(sent).toHaveLength(0)
  })

  it('never throws, even when sending or the context fails', async () => {
    const a = make({ send: async () => { throw new Error('offline') } })
    await expect(a.reporter.report('other', 'one')).resolves.toBeUndefined()
    const b = make({ context: () => { throw new Error('no os') } })
    await expect(b.reporter.report('other', 'two')).resolves.toBeUndefined()
  })

  it('cuts very long messages and stacks', async () => {
    const { reporter, sent } = make()
    const e = new Error('z'.repeat(5000))
    e.stack = 'z'.repeat(20000)
    await reporter.report('main_exception', e)
    expect((sent[0].body.message as string).length).toBe(1500)
    expect((sent[0].body.stack as string).length).toBe(8000)
  })
})

describe('postJson', () => {
  it('posts JSON and swallows a network failure', async () => {
    const ok = vi.fn(async () => new Response(null, { status: 204 }))
    await postJson(ok as unknown as typeof fetch)('https://x.test/a', '{"a":1}')
    expect(ok).toHaveBeenCalledWith('https://x.test/a', expect.objectContaining({ method: 'POST', body: '{"a":1}' }))
    const bad = vi.fn(async () => { throw new Error('down') })
    await expect(postJson(bad as unknown as typeof fetch)('https://x.test/a', '{}')).resolves.toBeUndefined()
  })
})
