import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const mainIdx = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')

describe('dead themes removed (spec §7.5)', () => {
  it('css has no data-theme selectors for the three dead themes', () => {
    expect(css).not.toContain('[data-theme="aurora"]')
    expect(css).not.toContain('[data-theme="mono"]')
    expect(css).not.toContain('[data-theme="tropical"]')
  })
  it('main no longer reads a saved theme for backgroundColor', () => {
    expect(mainIdx).not.toContain('themeColors')
    expect(mainIdx).toContain("'#0a0908'")
  })
})
