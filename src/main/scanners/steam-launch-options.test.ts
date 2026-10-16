import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { launchOptionsOf, riskyOptionsIn, launchOptionFindings } from './steam-launch-options'
import { KeywordMatcher } from '../services/keyword-matcher'

const vdf = (cs2: string, unturned = ''): string => `"UserLocalConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"apps"
\t\t\t\t{
\t\t\t\t\t"730"
\t\t\t\t\t{
\t\t\t\t\t\t"LastPlayed"\t\t"1792089518"
${cs2 ? `\t\t\t\t\t\t"LaunchOptions"\t\t"${cs2}"` : ''}
\t\t\t\t\t}
\t\t\t\t\t"304930"
\t\t\t\t\t{
${unturned ? `\t\t\t\t\t\t"LaunchOptions"\t\t"${unturned}"` : ''}
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}
`

describe('launchOptionsOf', () => {
  it('reads the options of the asked game only', () => {
    const v = vdf('-novid -insecure', '-windowed')
    expect(launchOptionsOf(v, 730)).toBe('-novid -insecure')
    expect(launchOptionsOf(v, 304930)).toBe('-windowed')
  })

  it('is null when no options are set', () => {
    expect(launchOptionsOf(vdf(''), 730)).toBeNull()
    expect(launchOptionsOf('', 730)).toBeNull()
  })

  it('unescapes quotes inside the options', () => {
    expect(launchOptionsOf(vdf('+exec \\"my cfg\\" -insecure'), 730)).toBe('+exec "my cfg" -insecure')
  })

  it('ignores a LaunchOptions line that is not under apps', () => {
    const odd = '"Root"\n{\n"730"\n{\n"LaunchOptions" "-insecure"\n}\n}\n'
    expect(launchOptionsOf(odd, 730)).toBeNull()
  })
})

describe('riskyOptionsIn', () => {
  it('finds the options that switch protection off', () => {
    expect(riskyOptionsIn('-novid -insecure +fps_max 0').map((o) => o.flag)).toEqual(['-insecure'])
    expect(riskyOptionsIn('-allow_third_party_software -insecure').map((o) => o.flag)).toEqual([
      '-insecure',
      '-allow_third_party_software'
    ])
  })

  it('does not take a longer flag for a risky one', () => {
    expect(riskyOptionsIn('-novid -high -console -insecure_mode_x')).toEqual([])
  })
})

describe('launchOptionFindings', () => {
  const root = mkdtempSync(join(tmpdir(), 'custos-steam-'))
  mkdirSync(join(root, 'userdata', '1417004269', 'config'), { recursive: true })
  writeFileSync(join(root, 'userdata', '1417004269', 'config', 'localconfig.vdf'), vdf('-novid -insecure', '-insecure'))

  it('reports the checked game only, with the account as a SteamID64', async () => {
    const f = await launchOptionFindings(root, 'cs2')
    expect(f).toEqual([
      '[Steam Launch Options] Counter-Strike 2 launch option -insecure (starts the game without VAC) | SteamID: 76561199377269997'
    ])
  })

  it('checks every game when none is chosen', async () => {
    expect(await launchOptionFindings(root, null)).toHaveLength(2)
  })

  it('is empty without a userdata folder', async () => {
    expect(await launchOptionFindings(join(root, 'nope'), 'cs2')).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })
})

describe('the matcher knows a launch-option finding', () => {
  it('returns the option as the lead', () => {
    const m = new KeywordMatcher({ patterns: [], exactMatch: [] })
    expect(
      m.findKeywordInFinding(
        '[Steam Launch Options] Counter-Strike 2 launch option -insecure (starts the game without VAC) | SteamID: 7656'
      )
    ).toBe('-insecure')
  })
})
