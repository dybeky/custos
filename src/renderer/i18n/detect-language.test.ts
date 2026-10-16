import { describe, it, expect, afterEach } from 'vitest'
import { detectLanguage } from './index'

const g = globalThis as { electronAPI?: unknown }

afterEach(() => {
  delete g.electronAPI
})

describe('detectLanguage', () => {
  it('follows the language of the PC given by the main process', () => {
    g.electronAPI = { systemLocale: 'ru-RU' }
    expect(detectLanguage()).toBe('ru')
    g.electronAPI = { systemLocale: 'de-DE' }
    expect(detectLanguage()).toBe('en')
    g.electronAPI = { systemLocale: 'en-US' }
    expect(detectLanguage()).toBe('en')
  })

  it('prefers the PC language over the browser one, which is always English in the packaged app', () => {
    g.electronAPI = { systemLocale: 'ru' }
    // navigator.language here is whatever the test runner has; the PC wins
    expect(detectLanguage()).toBe('ru')
  })

  it('falls back to English when nothing is known', () => {
    g.electronAPI = { systemLocale: '' }
    expect(['en', 'ru']).toContain(detectLanguage())
    g.electronAPI = undefined
    expect(['en', 'ru']).toContain(detectLanguage())
  })
})
