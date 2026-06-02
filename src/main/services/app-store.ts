import Store from 'electron-store'
import type { UserSettings } from '../../shared/types'

export interface AppStoreSchema {
  settings: UserSettings
}

export const appStore = new Store<AppStoreSchema>({
  defaults: {
    settings: {
      language: 'en',
      theme: 'tropical'
    }
  }
})
