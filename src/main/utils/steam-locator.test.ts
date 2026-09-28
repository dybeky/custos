import { describe, it, expect } from 'vitest'
import { parseLibraryFolders } from './steam-locator'

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
