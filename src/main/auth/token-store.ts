// CachedUser / AuthRecord are defined once in app-store.ts (single source of truth).
import type { CachedUser, AuthRecord } from '../services/app-store'

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}

export interface AuthStoreLike {
  get(key: 'auth'): AuthRecord | undefined
  set(key: 'auth', value: AuthRecord): void
  delete(key: 'auth'): void
}

/**
 * Bearer storage. Encrypts via safeStorage and persists base64 under `auth`.
 * FAIL CLOSED: if encryption is unavailable, the token is held in memory for
 * the current run only and is never written to disk in plaintext.
 */
export class TokenStore {
  private memoryToken: string | null = null
  constructor(private deps: { safeStorage: SafeStorageLike; store: AuthStoreLike }) {}

  isEncryptionAvailable(): boolean {
    return this.deps.safeStorage.isEncryptionAvailable()
  }

  /** @returns true if the token was persisted encrypted, false if memory-only. */
  save(token: string): boolean {
    this.memoryToken = token
    if (!this.deps.safeStorage.isEncryptionAvailable()) {
      // Fail closed: keep in memory, do NOT write plaintext.
      const rec = this.deps.store.get('auth') ?? {}
      this.deps.store.set('auth', { ...rec, tokenEnc: undefined })
      return false
    }
    const enc = this.deps.safeStorage.encryptString(token).toString('base64')
    const rec = this.deps.store.get('auth') ?? {}
    this.deps.store.set('auth', { ...rec, tokenEnc: enc })
    return true
  }

  load(): string | null {
    if (this.memoryToken) return this.memoryToken
    const rec = this.deps.store.get('auth')
    if (!rec?.tokenEnc) return null
    if (!this.deps.safeStorage.isEncryptionAvailable()) return null
    try {
      const token = this.deps.safeStorage.decryptString(Buffer.from(rec.tokenEnc, 'base64'))
      this.memoryToken = token
      return token
    } catch {
      this.clear()
      return null
    }
  }

  clear(): void {
    this.memoryToken = null
    this.deps.store.set('auth', {})
  }

  saveUser(user: CachedUser): void {
    const rec = this.deps.store.get('auth') ?? {}
    this.deps.store.set('auth', { ...rec, user })
  }

  loadUser(): CachedUser | null {
    return this.deps.store.get('auth')?.user ?? null
  }
}
