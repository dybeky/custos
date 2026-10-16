import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { KeywordSettingsSchema, flattenKeywords } from './config-service'
import { KeywordMatcher } from './keyword-matcher'

// A broad set of ordinary things found on a gamer's PC, run against the REAL
// bundled keywords. None of them is a cheat: a match here is a false lead that
// could put an innocent player under suspicion.
const raw = JSON.parse(readFileSync(join(process.cwd(), 'resources/keywords.json'), 'utf8'))
const matcher = new KeywordMatcher(flattenKeywords(KeywordSettingsSchema.parse(raw)))

const U = 'C:\\Users\\Max\\'
const INNOCENT = [
  // everyday programs and folders
  `${U}AppData\\Roaming\\Discord\\Cache\\data_0`,
  `${U}AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`,
  `${U}AppData\\Local\\Google\\Chrome\\User Data\\Default\\History`,
  `${U}AppData\\Roaming\\Spotify\\Spotify.exe`,
  `${U}AppData\\Local\\Temp\\chrome_installer.exe`,
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Steam\\steam.exe',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Unturned\\Unturned.exe',
  'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\304930\\123456\\Map.dat',
  'C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\NVIDIA app.exe',
  'C:\\Windows\\System32\\drivers\\etc\\hosts',
  // Windows and gaming tools whose names contain the same letters as cheat names
  'C:\\Windows\\System32\\SecurityHealthSystray.exe',
  'C:\\Program Files\\Windows Defender\\MpCmdRun.exe',
  'C:\\Program Files\\Windows Defender Advanced Threat Protection\\MsSense.exe',
  'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
  'C:\\Program Files (x86)\\Battle.net\\Battle.net.exe',
  'C:\\Program Files\\Rockstar Games\\Launcher\\Launcher.exe',
  'C:\\Program Files (x86)\\Origin\\Origin.exe',
  'C:\\Program Files\\Overwolf\\Overwolf.exe',
  'C:\\Program Files\\MSI Afterburner\\MSIAfterburner.exe',
  'C:\\Program Files\\OBS Studio\\bin\\64bit\\obs64.exe',
  'C:\\Program Files\\Razer\\Synapse3\\Razer Synapse 3.exe',
  'C:\\Program Files\\Logitech Gaming Software\\LCore.exe',
  // an account named like a cheat is a person, not a lead
  'C:\\Users\\Mason\\Downloads\\hack the box.pdf',
  'C:\\Users\\Midnight\\Documents\\notes.txt',
  'C:\\Users\\Ancient\\Desktop\\a.exe',
  `${U}Downloads\\esp32-firmware.bin`,
  `${U}Downloads\\esp-idf-setup.exe`,
  `${U}Downloads\\hwid-generator.exe`,
  // words with the same letters inside other words
  `${U}Documents\\Hackathon 2026\\notes.txt`,
  `${U}Documents\\Cheatsheet Python.pdf`,
  `${U}Downloads\\Espresso Machine Manual.pdf`,
  `${U}Music\\Midnight City - M83.mp3`,
  `${U}Music\\Medusa (Official Video).mp4`,
  `${U}Music\\Ancient Aliens S01E01.mkv`,
  `${U}Videos\\Fatality Compilation.mp4`,
  `${U}Pictures\\Mason Jar.png`,
  `${U}Downloads\\Titanium Backup.zip`,
  `${U}Documents\\Thanking letter.docx`,
  `${U}Documents\\Mason Smith CV.pdf`,
  `${U}Documents\\Melony Invoice 04.pdf`,
  `${U}Games\\Undead Nightmare\\game.exe`,
  `${U}Documents\\arcane season 2 subtitles.srt`,
  `${U}Downloads\\Arcane.S01E01.1080p.mkv`,
  // browsing
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://store.steampowered.com/app/304930/Unturned/',
  'https://steamcommunity.com/sharedfiles/filedetails/?id=123456',
  'https://www.reddit.com/r/Unturned/comments/abc/how_to_build_a_base/',
  'https://en.wikipedia.org/wiki/Ancient_Rome',
  'https://en.wikipedia.org/wiki/Midnight_(disambiguation)',
  'https://www.spiegel.de/wissenschaft',
  'https://github.com/microsoft/vscode',
  'https://unturned-servers.net/blog/458/unturneds-source-code-released/',
  'https://unturned.wiki.gg/wiki/Valve_Anti-Cheat',
  'https://github.com/RocketModFix/RocketModFix',
  `${U}Downloads\\Unturned Server Manager.zip`,
  `${U}Documents\\Unturned Server\\Rocket\\Plugins\\ZaupShop.dll`,
  'https://discord.com/channels/1/2',
  'https://cheatsheetseries.owasp.org/',
  'https://www.google.com/search?q=how+to+report+a+cheater',
  'https://www.google.com/search?q=unturned+server+rules+no+hacks',
  // process names
  'svchost.exe',
  'explorer.exe',
  'steamwebhelper.exe',
  'EasyAntiCheat.exe',
  'EasyAntiCheat_EOS.exe',
  'BEService.exe',
  'vgc.exe',
  'faceit.exe',
  'RiotClientServices.exe'
]

// The same cheats under the spellings people actually give them: spaces,
// underscores, versions, "setup". Each must be found.
const CHEATS = [
  `${U}Downloads\\Cheat Engine 7.5.exe`,
  `${U}Downloads\\Cheat_Engine_Setup.exe`,
  `${U}Downloads\\cheatengine-x86_64.exe`,
  `${U}Downloads\\Extreme Injector v3.exe`,
  `${U}Downloads\\SharpMonoInjector.exe`,
  `${U}Downloads\\kdmapper.exe`,
  `${U}Downloads\\spoofer_v2.exe`,
  `${U}Downloads\\spoofer-setup.exe`,
  `${U}Downloads\\HWID Spoofer.zip`,
  `${U}Downloads\\Unturned Cheat.txt`,
  `${U}Downloads\\Unturned_Hack_v5.dll`,
  `${U}Downloads\\Midnight CS2.exe`,
  `${U}Downloads\\Medusa Hack v3.exe`,
  'https://www.unknowncheats.me/forum/unturned',
  'https://www.mpgh.net/forum/',
  // Unturned cheats named in public source repositories
  `${U}Downloads\\MSZ-Reborn.zip`,
  `${U}Downloads\\CryEye 1.1\\CryEye.exe`,
  `${U}Downloads\\UnturnedHelper2026.exe`,
  `${U}Downloads\\Unturned-Tsunami-main.zip`,
  `${U}Downloads\\Uranus Unturned Hack v3.rar`,
  `${U}Downloads\\Unturned ESP.dll`,
  `${U}Downloads\\Unturned_Spoofer.exe`,
  'C:\\Users\\Mason\\Downloads\\Aimbot.rar'
]

describe('cheat spellings', () => {
  it.each(CHEATS)('flags %s', (v) => {
    expect(matcher.findKeywordInFinding(v)).not.toBeNull()
  })
})

describe('false-positive corpus', () => {
  it.each(INNOCENT)('does not flag %s', (v) => {
    expect(matcher.findKeywordInFinding(v)).toBeNull()
  })
})
