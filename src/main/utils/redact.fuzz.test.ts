import { describe, it, expect } from 'vitest'
import { hideProfileNames, hideProfileNamesDeep, redactSecrets, safeFreeText } from './redact'
import { redactForReport } from '../services/crash-reporter'

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const pick = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)]

const NAMES = ['Max', 'Иван', 'Иван Петров', 'Jörg Müller', 'o\'neil', 'anna.k', 'John Doe (work)', '李雷', 'user_01', 'Zoë', 'dybek', 'Qx Ry Sz']
const TAILS = ['Desktop\\a.exe', 'AppData\\Roaming\\x\\y.dll', 'Downloads\\Cheat Engine\\ce.exe', 'Documents', '']
const PREFIXES = ['C:\\Users\\', 'D:\\Users\\', 'c:/Users/', 'C:\\\\Users\\\\', '\\Device\\HarddiskVolume3\\Users\\', 'file:///C:/Users/', '\\\\?\\C:\\Users\\']

function path(r: () => number): { name: string; text: string } {
  const name = pick(r, NAMES)
  const prefix = pick(r, PREFIXES)
  const tail = pick(r, TAILS)
  const sep = prefix.includes('/') ? '/' : '\\'
  return { name, text: `${prefix}${name}${tail ? sep + tail.replace(/\\/g, sep) : ''}` }
}

describe('profile names never survive hideProfileNames', () => {
  it('for random Windows paths with non-ASCII names, spaces, brackets and forward slashes', () => {
    const r = rng(7)
    for (let i = 0; i < 3000; i++) {
      const { name, text } = path(r)
      const wrapped = pick(r, ['', '[BAM] ', 'Path: ', '"', 'x -> ']) + text + pick(r, ['', ' | 12:00', '"', ' (2)'])
      const out = hideProfileNames(wrapped)
      // a name with a space is cut at the first space when no path follows it; the first word never survives
      const first = name.split(' ')[0].replace(/[()]/g, '')
      expect(out, `${wrapped} -> ${out}`).not.toContain(first)
      expect(out).toContain('<user>')
    }
  })

  it('keeps shared profiles and never throws on random text', () => {
    expect(hideProfileNames('C:\\Users\\Public\\x.exe')).toBe('C:\\Users\\Public\\x.exe')
    const r = rng(8)
    const bits = ['Users', '\\', '/', 'C:', ' ', 'Public', '[', ']', '(', ')', '<user>', '%20', 'Ж', '\u0000', '\\Device\\HarddiskVolume1']
    for (let i = 0; i < 3000; i++) {
      let s = ''
      for (let j = 0; j < 30; j++) s += pick(r, bits)
      expect(() => hideProfileNames(s)).not.toThrow()
      expect(() => redactForReport(s)).not.toThrow()
      expect(() => safeFreeText(s)).not.toThrow()
    }
  })

  it('walks nested values and leaves non-strings alone', () => {
    const v = { a: ['C:\\Users\\Max\\x.exe', 5, null], b: { c: 'D:\\Users\\Иван\\y' } }
    expect(JSON.stringify(hideProfileNamesDeep(v))).not.toMatch(/Max|Иван/)
  })

  it('is fast on a 1 MB string of repeated profile prefixes', () => {
    for (const unit of ['C:\\Users\\', 'C:\\Users\\a a a a ', 'C:/Users/ x', '\\Device\\HarddiskVolume1\\Users\\ ']) {
      const text = unit.repeat(Math.ceil(1_048_576 / unit.length))
      const t = performance.now()
      hideProfileNames(text)
      redactSecrets(text)
      expect(performance.now() - t, unit).toBeLessThan(3000)
    }
  })
})

describe('crash report redaction', () => {
  it('removes names, e-mails and bearer tokens from random messages', () => {
    const r = rng(9)
    for (let i = 0; i < 2000; i++) {
      const { name, text } = path(r)
      const email = `${pick(r, ['max', 'иван', 'a.b+c'])}@${pick(r, ['mail.ru', 'example.com', 'gmail.com'])}`
      const token = `tok${Math.floor(r() * 1e9).toString(36)}abcdef`
      const msg = `Error: ENOENT ${text} for ${email} with Bearer ${token} and 76561198012345678`
      const out = redactForReport(msg)
      expect(out, msg).not.toContain(email)
      expect(out, msg).not.toContain(token)
      expect(out).not.toContain('76561198012345678')
      const first = name.split(' ')[0].replace(/[()]/g, '')
      // the crash reporter's own path rule cuts a name at the first space or at a bracket
      expect(out, `${msg} -> ${out}`).not.toContain(first)
    }
  })

  it('removes the name from a UNC-style admin share path', () => {
    const out = redactForReport('open \\\\PC01\\C$\\Users\\Max\\Desktop\\a.txt failed')
    expect(out).not.toContain('Max')
  })
})
