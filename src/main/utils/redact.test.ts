import { describe, it, expect } from 'vitest'
import { redactSecrets, safeFreeText, MAX_FREE_TEXT } from './redact'

describe('redactSecrets', () => {
  it('hides logins, passwords and e-mails in a page title', () => {
    const title = 'MY LOGINS Website: shop.com Login: someone@example.com Password: hunter2@ xone.fun'
    const out = redactSecrets(title)
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('someone@example.com')
    expect(out).toContain('Password: [hidden]')
    expect(out).toContain('xone.fun') // the keyword survives
  })

  it('handles other languages', () => {
    expect(redactSecrets('Пароль: qwerty123 логин=ivan')).toBe('Пароль: [hidden] логин=[hidden]')
    expect(redactSecrets('Kennwort: geheim')).toBe('Kennwort: [hidden]')
  })

  it('hides secret URL parameters but keeps the rest of the URL', () => {
    expect(redactSecrets('https://site.gg/cb?code=abc123&state=x&access_token=zzz'))
      .toBe('https://site.gg/cb?code=[hidden]&state=x&access_token=[hidden]')
  })

  it('leaves ordinary text alone', () => {
    const s = 'https://midnight.im/threads/3932/ | "CS2 cheat store | ON SALE"'
    expect(redactSecrets(s)).toBe(s)
    expect(redactSecrets('passing through: yes')).toBe('passing through: yes')
  })

  it('never erases the evidence: file names and paths stay as they are', () => {
    const files = [
      'C:\\Users\\Ivan\\Downloads\\aimbot@v2.0.exe',
      '[USN C:] loader@cheat.rar — created',
      '[Autorun HKCU] Token = C:\\Tools\\undead.exe',
      '[Recent Documents] User = D:\\cheats\\undead.zip'
    ]
    for (const s of files) expect(redactSecrets(s)).toBe(s)
    // A real address next to a file is still hidden.
    expect(redactSecrets('mail ivan@mail.ru about loader@v2.exe')).toBe('mail [email] about loader@v2.exe')
  })

  it('caps free text', () => {
    expect(safeFreeText('a'.repeat(1000))).toHaveLength(MAX_FREE_TEXT + 1)
  })
})
