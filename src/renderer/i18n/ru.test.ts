import { describe, it, expect } from 'vitest'
import en from './en.json'
import ru from './ru.json'
import i18next from 'i18next'
import { WHATS_NEW_RU, whatsNewRu } from './whats-new-ru'

type Tree = { [k: string]: string | Tree }

/** Every leaf path, with plural suffixes folded into one logical key. */
function leaves(tree: Tree, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') {
      const logical = path.replace(/_(zero|one|two|few|many|other)$/, '')
      out.set(logical, [...(out.get(logical) ?? []), v])
    } else {
      for (const [p, vals] of leaves(v, path)) out.set(p, [...(out.get(p) ?? []), ...vals])
    }
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

describe('Russian translation', () => {
  const enKeys = leaves(en as Tree)
  const ruKeys = leaves(ru as Tree)

  it('has every key the English file has, and nothing extra', () => {
    expect([...ruKeys.keys()].filter((k) => !enKeys.has(k))).toEqual([])
    expect([...enKeys.keys()].filter((k) => !ruKeys.has(k))).toEqual([])
  })

  it('uses the same {{placeholders}} as English for every string (except the "zero" wording)', () => {
    const flat = (t: Tree, prefix = '', out = new Map<string, string>()) => {
      for (const [k, v] of Object.entries(t)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (typeof v === 'string') out.set(path, v)
        else flat(v, path, out)
      }
      return out
    }
    const enFlat = flat(en as Tree)
    const bad: string[] = []
    for (const [path, value] of flat(ru as Tree)) {
      if (path.endsWith('_zero')) continue
      // Russian has more plural forms than English: they follow the English "other".
      const base = enFlat.get(path) ?? enFlat.get(path.replace(/_(few|many)$/, '_other'))
      if (base === undefined) continue
      const need = placeholders(base).join()
      if (placeholders(value).join() !== need) bad.push(`${path}: expected {{${need}}}`)
    }
    expect(bad).toEqual([])
  })

  it('has all four Russian plural forms wherever a count is used', () => {
    const counted = new Set<string>()
    const flat = (t: Tree, prefix = '') => {
      for (const [k, v] of Object.entries(t)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (typeof v === 'string') {
          if (/_(one|other)$/.test(k)) counted.add(path.replace(/_(one|other)$/, ''))
        } else flat(v, path)
      }
    }
    flat(en as Tree)
    const have = new Set<string>()
    const collect = (t: Tree, prefix = '') => {
      for (const [k, v] of Object.entries(t)) {
        const path = prefix ? `${prefix}.${k}` : k
        if (typeof v === 'string') have.add(path)
        else collect(v, path)
      }
    }
    collect(ru as Tree)
    const missing: string[] = []
    for (const base of counted) {
      for (const form of ['one', 'few', 'many', 'other']) {
        if (!have.has(`${base}_${form}`)) missing.push(`${base}_${form}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('does not leave untranslated English sentences in the Russian file', () => {
    const allowedEnglish =
      /^(Custos Pro|Custos 3\.x|English|Show in EN|LastActivityView|USBDeview|Everything|System Informer|ShellBag Analyzer|—|[A-Za-z0-9 ./:-]{1,24})$/
    const suspicious: string[] = []
    for (const [key, values] of ruKeys) {
      for (const v of values)
        if (!/[А-Яа-яЁё]/.test(v) && !allowedEnglish.test(v)) suspicious.push(`${key}: ${v}`)
    }
    expect(suspicious).toEqual([])
  })

  it('picks the right Russian plural form (1 проверка, 2 проверки, 5 проверок, 21 проверка)', async () => {
    const inst = i18next.createInstance()
    await inst.init({
      lng: 'ru',
      resources: { ru: { translation: ru } },
      interpolation: { escapeValue: false }
    })
    const word = (n: number) => inst.t('casefile.checks', { count: n }).replace(/^\d+ /, '')
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(word)).toEqual([
      'проверка',
      'проверки',
      'проверки',
      'проверок',
      'проверок',
      'проверок',
      'проверок',
      'проверка',
      'проверки',
      'проверок',
      'проверка',
      'проверок'
    ])
    expect(inst.t('recheck.added', { count: 0 })).toBe('Новых зацепок нет')
    expect(inst.t('recheck.added', { count: 3 })).toBe('+3 новые зацепки')
    expect(inst.t('seenBefore.times', { count: 2 })).toBe('Этого игрока уже проверяли 2 раза.')
    expect(inst.t('seenBefore.times', { count: 5 })).toBe('Этого игрока уже проверяли 5 раз.')
  })

  it('has Russian release notes in the groups the app knows, written in Russian', () => {
    const groups = new Set(['New', 'Fixes', 'Performance', 'Improvements'])
    for (const [version, list] of Object.entries(WHATS_NEW_RU)) {
      expect(whatsNewRu(version)).toBe(list)
      for (const g of list) {
        expect(groups.has(g.group), `${version}: ${g.group}`).toBe(true)
        expect(g.entries.length).toBeGreaterThan(0)
        for (const e of g.entries) expect(/[А-Яа-яЁё]/.test(e.text), e.text).toBe(true)
      }
    }
    expect(whatsNewRu('9.9.9')).toBeNull()
  })
})
