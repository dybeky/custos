import { describe, it, expect } from 'vitest'
import { parseActiveUser, pickPlayer, steamId64FromAccountId } from './player-detect'
import { VdfParser, type SteamAccount } from './vdf-parser'
import { scanPlayerLabel, playerKey } from '../../shared/history'

const alt: SteamAccount = { steamId: '76561198000000001', accountName: 'alt_acc', personaName: 'Alt', rememberPassword: true, timestamp: 1_800_000_000 }
const main: SteamAccount = { steamId: '76561198012345678', accountName: 'main_acc', personaName: 'Bob', rememberPassword: true, timestamp: 1_700_000_000, mostRecent: true }

describe('player detection', () => {
  it('converts Steam\'s 32-bit ActiveUser to a SteamID64', () => {
    expect(steamId64FromAccountId(52079950)).toBe('76561198012345678')
  })

  it('reads ActiveUser from reg query output; 0 means signed out', () => {
    const out = (hex: string) =>
      `\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\\ActiveProcess\r\n    ActiveUser    REG_DWORD    0x${hex}\r\n\r\n`
    expect(parseActiveUser(out('31aad4e'))).toBe(52079950)
    expect(parseActiveUser(out('0'))).toBeNull()
    expect(parseActiveUser('ERROR: The system was unable to find the specified registry key or value.')).toBeNull()
  })

  it('prefers the account Steam is signed in to right now', () => {
    expect(pickPlayer([alt, main], 52079950)).toEqual({
      steamId: '76561198012345678', accountName: 'main_acc', personaName: 'Bob', source: 'running'
    })
  })

  it('keeps a signed-in account that loginusers.vdf does not list', () => {
    expect(pickPlayer([alt], 52079950)).toEqual({ steamId: '76561198012345678', accountName: '', source: 'running' })
  })

  it('falls back to MostRecent, then to the newest sign-in', () => {
    expect(pickPlayer([alt, main], null)).toMatchObject({ steamId: main.steamId, source: 'recent' })
    const { mostRecent: _drop, ...noFlag } = main
    expect(pickPlayer([noFlag, alt], null)).toMatchObject({ steamId: alt.steamId, source: 'recent' })
    expect(pickPlayer([], null)).toBeNull()
  })

  it('parses the MostRecent flag from loginusers.vdf', () => {
    const vdf = `"users"\n{\n  "76561198012345678"\n  {\n    "AccountName"  "main_acc"\n    "PersonaName"  "Bob"\n    "MostRecent"  "1"\n  }\n  "76561198000000001"\n  {\n    "AccountName"  "alt_acc"\n    "MostRecent"  "0"\n  }\n}\n`
    const accounts = new VdfParser().parseSteamAccounts(vdf)
    expect(accounts.map((a) => a.mostRecent)).toEqual([true, false])
  })

  it('labels the player so the site files it under the SteamID, not the nickname', () => {
    const label = scanPlayerLabel({ steamId: main.steamId, accountName: 'main_acc', personaName: 'Bob', source: 'running' })
    expect(label).toBe('Bob (76561198012345678)')
    expect(playerKey(label)).toBe('steam:76561198012345678')
    expect(scanPlayerLabel({ steamId: main.steamId, accountName: '', source: 'running' })).toBe('76561198012345678')
    expect(scanPlayerLabel({ steamId: main.steamId, accountName: 'x', personaName: 'n'.repeat(300), source: 'recent' }).length).toBeLessThanOrEqual(120)
  })
})
