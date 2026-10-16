import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

// The REAL bundled base, one matcher per game, the way a check builds them.
const raw = KeywordSettingsSchema.parse(JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8')))
const forGame = (g: string | null) => new KeywordMatcher(flattenKeywords(raw, g))
const cs2 = forGame('cs2')
const unturned = forGame('unturned')
const everything = forGame(null)

const D = 'C:\\Users\\Max\\Downloads\\'

describe('CS2 base', () => {
  it.each([
    D + 'CS2_External-main.zip',
    D + 'cs2-internal-cheat\\loader.exe',
    D + 'Valthrun\\valthrun-driver.sys',
    D + 'DragonBurn.exe',
    // private providers named by the checker
    D + 'Iniuria_loader.exe',
    D + 'AnyX.exe',
    D + 'Satan 5 loader.exe',
    D + 'Phantom Overlay\\overlay.exe',
    D + 'VaporCheats_Setup.exe',
    D + 'VRedux.dll',
    D + 'Pellix.exe',
    D + '420 Cheats loader.exe',
    D + 'Clutch-Solution\\firmware.bin',
    D + 'ekknod-EC-CS2-main.zip',
    D + 'Rift 7 CS2 cheat.exe',
    D + 'CompKiller.exe',
    D + 'Pandaware_loader.exe',
    D + 'Undetek.zip',
    D + 'Evolvedware setup.exe',
    // sites of the providers (history, DNS cache)
    'https://anyx.gg/',
    'https://pellix.xyz/',
    'https://iniuria.us/forum',
    'https://vredux.com/',
    'https://satan5.com/cheats/cs2-cheat/',
    'https://nixware.cc/',
    'https://www.memesense.gg/',
    'https://primordial.dev/',
    'https://clutch-solution.com/forums/topic/73420-cs2-dma-version/',
    'https://cheat-reviews.com/games/cs2',
    'https://docs.clutchkeys.com/documentation/counter-strike-2',
    'https://www.gcscheats.com/counter-strike-2-cheats/420-cheats/',
    'https://midnight.im/store/chity-cs-2/',
    'www.weave.gg',
    'https://invision.gg/',
    'https://fantasy.cat/',
    'https://novo.win/',
    D + 'ev0lve_loader.exe',
    D + 'Legendware v4.exe',
    D + 'cs2 skin changer.exe',
    D + 'CS2-DMA\\leechcore.dll',
    D + 'TempleWare-Public.zip',
    D + 'cs2-dumper.exe',
    D + 'AntiAim.dll',
    'https://www.unknowncheats.me/forum/counter-strike-2-a/',
    'https://fatality.win/'
  ])('flags %s', (v) => {
    expect(cs2.findKeywordInFinding(v)).not.toBeNull()
  })

  it.each([
    'C:\\Program Files\\AMD\\Catalyst Control Center\\CCC.exe',
    'C:\\Program Files\\InVision Studio\\InVision Studio.exe',
    'C:\\Users\\Max\\Downloads\\Oxide Games - Ashes of the Singularity.url',
    'C:\\Users\\Max\\Documents\\Primordial soup notes.docx',
    'C:\\Users\\Max\\Downloads\\Nightfall.exe',
    'C:\\Users\\Max\\Documents\\Legions of Rome.pdf',
    'C:\\Users\\Max\\Documents\\Rift 7 meeting.docx',
    'C:\\Users\\Max\\Games\\Hyperion\\hyperion.exe',
    'C:\\Users\\Max\\Music\\Pandora (Radio).url',
    'C:\\Users\\Max\\Videos\\Osiris (2020).mkv',
    'C:\\Users\\Max\\Documents\\Skeet shooting rules.pdf',
    'C:\\Users\\Max\\AppData\\Local\\Luno\\Luno.exe',
    'C:\\Users\\Max\\Downloads\\Hysteria (2018).mp4',
    'C:\\Users\\Max\\Downloads\\Deadlocked.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg\\autoexec.cfg',
    'C:\\Users\\Max\\Documents\\cs2 crosshair settings.txt',
    'C:\\Users\\Max\\Downloads\\FACEIT-Setup.exe',
    'C:\\Users\\Max\\AppData\\Local\\FACEIT\\faceitclient.exe',
    'C:\\Users\\Max\\Downloads\\cs2-esp32-board-notes.pdf',
    'https://steamcommunity.com/app/730/discussions/',
    'https://www.hltv.org/matches',
    'https://counter-strike.net/',
    'https://csgostats.gg/player/76561198000000000',
    'https://leetify.com/app/profile/1',
    'https://www.reddit.com/r/GlobalOffensive/comments/abc/cheaters_in_premier/'
  ])('does not flag %s', (v) => {
    expect(cs2.findKeywordInFinding(v)).toBeNull()
  })
})

describe('one base per game', () => {
  it('a CS2 check does not use the Unturned base', () => {
    expect(unturned.findKeywordInFinding(D + 'MSZ-Reborn.zip')).not.toBeNull()
    expect(cs2.findKeywordInFinding(D + 'MSZ-Reborn.zip')).toBeNull()
  })

  it('an Unturned check does not use the CS2 base', () => {
    expect(cs2.findKeywordInFinding(D + 'CS2_External-main.zip')).not.toBeNull()
    expect(unturned.findKeywordInFinding(D + 'CS2_External-main.zip')).toBeNull()
  })

  it('both stay on the shared list', () => {
    for (const m of [cs2, unturned]) expect(m.findKeywordInFinding(D + 'Aimbot.rar')).not.toBeNull()
  })

  it('a check with no game, or an unknown one, uses every base', () => {
    expect(everything.findKeywordInFinding(D + 'MSZ-Reborn.zip')).not.toBeNull()
    expect(everything.findKeywordInFinding(D + 'CS2_External-main.zip')).not.toBeNull()
    expect(forGame('nope').findKeywordInFinding(D + 'CS2_External-main.zip')).not.toBeNull()
  })
})
