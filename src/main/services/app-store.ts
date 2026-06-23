import Store from 'electron-store'
import type { UserSettings, PublicUser } from '../../shared/types'

// CachedUser / AuthRecord are defined once here (single source of truth).
export type CachedUser = PublicUser

export interface AuthRecord {
  tokenEnc?: string
  user?: CachedUser
}

export interface AppStoreSchema {
  settings: UserSettings
  auth: AuthRecord
}

export const appStore = new Store<AppStoreSchema>({
  defaults: {
    settings: {
      language: 'en',
      theme: 'tropical'
    },
    auth: {}
  }
})
