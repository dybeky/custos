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

// Lives in this launch's session folder (see ephemeral.ts) and is wiped on
// quit, like everything else Custos writes.
export const appStore = new Store<AppStoreSchema>({
  // A config.json corrupted by a crash or power loss would otherwise throw at
  // import time and stop Custos from starting at all, before any error could
  // be shown. The store only holds preferences and a re-obtainable login, so
  // starting fresh is the right recovery.
  clearInvalidConfig: true,
  defaults: {
    settings: {
      colorTheme: 'espresso'
    },
    auth: {},
    triage: { whitelistedSignatures: [] }
  }
})
