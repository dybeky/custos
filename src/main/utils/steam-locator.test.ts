import { describe, it, expect } from 'vitest'
import { parseLibraryFolders, parseSteamTarget } from './steam-locator'

describe('parseLibraryFolders', () => {
  it('reads every library root, unescaping backslashes', () => {
    const vdf = `"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "label" "" }
  "1" { "path"		"D:\\\\SteamLibrary" "apps" { "304930" "123" } }
}`
    expect(parseLibraryFolders(vdf)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])
  })

  it('returns nothing for an empty or foreign file', () => {
    expect(parseLibraryFolders('')).toEqual([])
    expect(parseLibraryFolders('"label" "x"')).toEqual([])
  })
})

describe('parseSteamTarget', () => {
  it('reads Steam itself, a game, a folder in a game and a folder in Steam', () => {
    expect(parseSteamTarget('')).toEqual({ kind: 'steam', sub: [] })
    expect(parseSteamTarget('Unturned')).toEqual({ kind: 'game', game: 'Unturned', sub: [] })
    expect(parseSteamTarget('Counter-Strike Global Offensive/game/csgo/cfg')).toEqual({
      kind: 'game',
      game: 'Counter-Strike Global Offensive',
      sub: ['game', 'csgo', 'cfg']
    })
    expect(parseSteamTarget('@steam/userdata')).toEqual({ kind: 'steam', sub: ['userdata'] })
  })

  it('refuses anything that could leave Steam’s folders', () => {
    for (const bad of ['..', '../x', 'Unturned/..', 'Unturned/../../x', 'C:/Windows', 'Unturned\\Logs', '/abs', '@steam', '@steam/', 'a//b', '.', 'Unturned/.', 'x/ ', 'x/y.', '@steam/../x', 'a/b/c/d/e/f/g']) {
      expect(parseSteamTarget(bad), bad).toBeNull()
    }
  })
})
