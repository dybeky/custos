import { describe, it, expect } from 'vitest'
import en from './en.json'
import ru from './ru.json'

const REQUIRED = [
  'signIn', 'signOut', 'openProfile', 'continueGoogle', 'continueGithub',
  'useCode', 'enterCodeAt', 'yourCode', 'waitingApproval',
  'loginFailed', 'callbackBlocked', 'deviceExpired', 'serverUnavailable',
  'encryptionUnavailable', 'signedOut', 'retry'
]

describe('auth i18n keys', () => {
  it('en has every required auth key', () => {
    for (const k of REQUIRED) expect((en as any).auth?.[k], `en.auth.${k}`).toBeTruthy()
  })
  it('ru has the same key set as en', () => {
    expect(Object.keys((ru as any).auth ?? {}).sort()).toEqual(Object.keys((en as any).auth ?? {}).sort())
  })
})
