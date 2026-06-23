import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const tw = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8')

describe('font divergences (spec §7.2)', () => {
  it('keeps Inter as Cyrillic fallback in the display/body stack', () => {
    expect(tw).toContain("display: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif']")
    expect(tw).toContain("body: ['MuseoModerno', 'Inter', 'system-ui', 'sans-serif']")
  })
  it('keeps JetBrains Mono as a true monospace for forensic data', () => {
    expect(tw).toContain("mono: ['JetBrains Mono', 'monospace']")
  })
})
