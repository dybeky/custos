import Store from 'electron-store'
import type { UserSettings, PublicUser, TriageSettings } from '../../shared/types'

// CachedUser / AuthRecord are defined once here (single source of truth).
export type CachedUser = PublicUser

export interface AuthRecord {
  tokenEnc?: string
  user?: CachedUser
}

export interface AppStoreSchema {
  settings: UserSettings
  auth: AuthRecord
  triage: TriageSettings
}

export const appStore = new Store<AppStoreSchema>({
  defaults: {
    settings: {
      language: 'en',
      uiMode: 'classic'
    },
    auth: {},
    triage: { whitelistedSignatures: [] }
  }
})
