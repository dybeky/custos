import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'src/renderer/styles/index.css'), 'utf8')
const tw = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8')

describe('design tokens retargeted to web (spec §7.1)', () => {
  it('css :root uses the web target hexes', () => {
    expect(css).toContain('--bg:#0a0908')
    expect(css).toContain('--panel:#141110')
    expect(css).toContain('--panel-2:#1c1815')
    expect(css).toContain('--ink:#f4f0ea')
    expect(css).toContain('--scan:#c89a6a')
    expect(css).toContain('--scan-dim:#8a7b68')
    expect(css).toContain('--alert:#e0604c')
    expect(css).toContain('--amber:#e3a45c')
    expect(css).toContain('--on-accent:#14100c')
    expect(css).toContain('--glow:200,154,106')
  })
  it('css drops the old base hex', () => {
    expect(css).not.toContain('#0E0C0A')
  })
  it('tailwind maps tokens to the web targets incl on-accent', () => {
    expect(tw).toContain("'on-accent': '#14100c'")
    expect(tw).toContain("scan: '#c89a6a'")
    expect(tw).toContain("bg: '#0a0908'")
  })
})
