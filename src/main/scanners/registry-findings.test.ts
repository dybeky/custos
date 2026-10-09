import { describe, it, expect } from 'vitest'
import { registryFindings, rot13 } from './registry-query-scanner'
import { KeywordMatcher } from '../services/keyword-matcher'

const matcher = new KeywordMatcher({ patterns: ['undead'], exactMatch: [], ambiguous: [] })
const UA = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'
const RECENT = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs'

const utf16 = (s: string) => Buffer.from(s + '\0', 'utf16le').toString('hex').toUpperCase()

describe('registryFindings', () => {
  it('decodes UserAssist value names (ROT13) before matching', () => {
    const name = rot13('C:\\Games\\Undead Loader\\loader.exe')
    expect(name).toBe('P:\\Tnzrf\\Haqrnq Ybnqre\\ybnqre.rkr')
    const out = [
      `${UA}\\{CEBFF5CD-ACE2-4F4F-9178-9926F41749EA}\\Count`,
      `    ${name}    REG_BINARY    00000000050000000000000000000000`,
      `    HRZR_PGYFRFFVBA    REG_BINARY    00000000`
    ].join('\r\n')
    expect(registryFindings(out, 'UserAssist', UA, matcher)).toEqual([
      '[UserAssist] C:\\Games\\Undead Loader\\loader.exe'
    ])
  })

  it('reads file names stored as UTF-16 inside REG_BINARY data (RecentDocs)', () => {
    const out = [
      `${RECENT}\\.zip`,
      `    0    REG_BINARY    ${utf16('undead_v3.zip')}5A00320000000000`,
      `    MRUListEx    REG_BINARY    00000000FFFFFFFF`
    ].join('\r\n')
    const findings = registryFindings(out, 'Recent Documents', RECENT, matcher)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('undead_v3.zip')
  })

  it('does not ROT13 other keys, and keeps plain string data matching', () => {
    const run = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    const out = `${run}\r\n    Loader    REG_SZ    C:\\Tools\\undead.exe`
    expect(registryFindings(out, 'Autorun HKCU', run, matcher)).toEqual([
      '[Autorun HKCU] Loader = C:\\Tools\\undead.exe'
    ])
    expect(registryFindings(`${run}\r\n    ${rot13('C:\\undead.exe')}    REG_SZ    x`, 'Autorun HKCU', run, matcher)).toEqual([])
  })
})
