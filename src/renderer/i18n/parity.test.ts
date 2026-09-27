import { describe, it, expect } from 'vitest'
import en from './en.json'
import ru from './ru.json'

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/** Flatten nested translation keys; plural variants collapse to their base key. */
function keys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') keys(v as Record<string, unknown>, path).forEach((x) => out.add(x))
    else out.add(path.replace(PLURAL_SUFFIX, ''))
  }
  return out
}

describe('i18n parity', () => {
  const enKeys = keys(en)
  const ruKeys = keys(ru)

  it('every English key has a Russian translation', () => {
    expect([...enKeys].filter((k) => !ruKeys.has(k))).toEqual([])
  })

  it('Russian has no keys missing from English', () => {
    expect([...ruKeys].filter((k) => !enKeys.has(k))).toEqual([])
  })
})
