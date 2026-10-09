import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { COLOR_THEMES, THEME_SWATCHES } from '../../shared/themes'

const css = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const tw = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8')

const CHANNELS = ['bg', 'panel', 'panel-2', 'ink', 'ink-dim', 'scan', 'scan-2', 'scan-dim', 'alert', 'amber', 'ok', 'on-accent']

/** The CSS block for a theme selector, e.g. :root[data-theme="violet"] { … }. */
function themeBlock(id: string): string {
  const sel = id === 'noir' ? ':root, :root[data-theme="noir"]' : `:root[data-theme="${id}"]`
  const start = css.indexOf(`${sel} {`)
  expect(start, `block for ${id}`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

const hex = (rgb: string) => '#' + rgb.split(' ').map((n) => Number(n).toString(16).padStart(2, '0')).join('')

describe('color themes', () => {
  it.each(COLOR_THEMES)('%s defines every color channel and the glow', (id) => {
    const block = themeBlock(id)
    for (const ch of CHANNELS) expect(block, `${id} --${ch}-rgb`).toMatch(new RegExp(`--${ch}-rgb:\\d+ \\d+ \\d+;`))
    expect(block).toMatch(/--glow:\d+,\d+,\d+;/)
  })

  it.each(COLOR_THEMES)('%s window/picker swatches match its CSS channels', (id) => {
    const block = themeBlock(id)
    const channel = (name: string) => new RegExp(`--${name}-rgb:(\\d+ \\d+ \\d+);`).exec(block)![1]
    expect(THEME_SWATCHES[id].bg).toBe(hex(channel('bg')))
    expect(THEME_SWATCHES[id].accent).toBe(hex(channel('scan')))
  })

  it('uses Noir (black, white, lime) as the default :root palette', () => {
    const block = themeBlock('noir')
    expect(block).toContain('--bg-rgb:6 6 6;')
    expect(block).toContain('--scan-rgb:200 255 46;')
  })

  it('tailwind resolves every core token through theme variables', () => {
    expect(tw).toContain('const c = (name) => `rgb(var(--${name}-rgb) / <alpha-value>)`')
    for (const token of ['bg', 'panel', 'ink', 'scan', 'alert', 'amber', 'ok']) expect(tw).toContain(`c('${token}')`)
    expect(tw).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('renderer components contain no hard-coded palette colors', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/roles\.ts$|Icon\w+\.tsx$/.test(name)) {
          if (/#[0-9a-fA-F]{6}\b/.test(readFileSync(p, 'utf8'))) offenders.push(p)
        }
      }
    }
    walk(join(process.cwd(), 'src/renderer'))
    expect(offenders).toEqual([])
  })
})
