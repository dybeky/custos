import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { CREDITS, COPYRIGHT } from './credits'

// LICENSE §2c: the authorship notices may not be removed. This guards them.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('authorship notices', () => {
  it('names dybeky as the author', () => {
    expect(CREDITS.author).toBe('dybeky')
    expect(COPYRIGHT).toContain('dybeky')
    expect(COPYRIGHT).toContain('All rights reserved')
  })

  it('stays in the license, the package and the app', () => {
    expect(read('LICENSE')).toContain('Copyright (c) 2026 dybeky (Paulus Platov). All rights reserved.')
    expect(JSON.parse(read('package.json')).author).toContain('dybeky')
    expect(read('electron-builder.yml')).toContain('dybeky')
    expect(read('src/renderer/pages/Settings.tsx')).toContain('<AboutCard />')
    expect(read('src/renderer/components/settings/AboutCard.tsx')).toContain('CREDITS.author')
    expect(read('src/renderer/components/layout/LaunchSplash.tsx')).toContain('CREDITS.author')
  })
})
