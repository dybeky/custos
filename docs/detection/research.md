# Custos Detection Signature Research

## Overview

This document records the research behind the indicators in `resources/keywords.json`. Each indicator is matched against filenames, window titles, process names, and loaded module names by the `KeywordMatcher` service.

### How indicators feed the keyword matcher

- **`patterns`** — substring-matched with pseudo-word-boundary semantics (a non-alphanumeric character must precede and follow the match, or it must sit at the start/end of the string). Use for strings that are distinctive enough to be recognisable in a longer path or process name (e.g. `egguware` will match `egguware.dll` and `C:\Users\x\egguware_v2\loader.exe`).
- **`exactMatch`** — matched only against the bare basename (extension stripped) of the scanned item. Use for short/generic strings such as `hwid` or `esp` that would produce false positives as substrings.

The file-hash scanner uses a separate `resources/hashes.json` list; indicator names here do not replace hash-based detection but complement it.

### Confidence notes

High-confidence entries have a verified DLL/executable name observed in malware-sandbox reports or open-source decompiled repositories. Medium-confidence entries are cheat product names seen on multiple reseller storefronts and cheat forums; they are distinctive enough to be used as substring patterns without major FP risk. Low-confidence entries are flagged below and placed in `exactMatch` where applicable.

---

## Indicator Table

| Indicator | Type | Cheat / Tool | Confidence | Source |
|-----------|------|-------------|------------|--------|
| `egguware` | dll / asset name | EgguWare Unturned cheat | High | [Hybrid Analysis — EgguWare.dll](https://hybrid-analysis.com/sample/4e8c32751e792c46622cab9def364fe3b24250a15675314708247e346615c6f5?environmentId=100); [GitHub Coopyy/EgguWare-Unturned](https://github.com/Coopyy/EgguWare-Unturned) |
| `egguwarev1` | asset filename base | EgguWare Unturned cheat | High | [Hybrid Analysis — egguware.v1.assets](https://hybrid-analysis.com/sample/92fb367d633c0f4c04cead1aad3fde98ee5f06897fc9083c7446c5ec420a57e0/5f342074d8c63843010f39cc); [GitHub EgguWare-Unturned/Assets](https://github.com/Coopyy/EgguWare-Unturned/blob/master/Assets/EgguWareV1.assets) |
| `defthack` | cheat name / project name | DeftHack (formerly CodakCheat) Unturned cheat | High | [GitHub Letomaniy/DeftHack-Unturned-OFFICIAL](https://github.com/Letomaniy/DeftHack-Unturned-OFFICIAL); [cheater.fun DeftHack](https://cheater.fun/other-hacks-games/5942-defthack-unturned-free-cheat.html) |
| `codakcheat` | alias (former name) | DeftHack / CodakCheat Unturned | High | [GitHub Maks7018/DeftHack](https://github.com/Maks7018/DeftHack) |
| `undeadhacks` | cheat name / project name | UndeadHacks Unturned cheat | High | [GitHub wristcry/undeadhacks-decompiled](https://github.com/wristcry/undeadhacks-decompiled) |
| `thanking` | cheat name / source project | Thanking Unturned hack | High | [GitHub keenan-smith/Thanking](https://github.com/keenan-smith/Thanking); [GitHub treeminder/defthack_leak](https://github.com/treeminder/defthack_leak) |
| `boccheat` | cheat name | BoCheat Unturned cheat base | High | [GitHub lgv-0/BoCheat-Unturned](https://github.com/lgv-0/BoCheat-Unturned); [GitHub zH4x/BoCheat-Unturned](https://github.com/zH4x/BoCheat-Unturned) |
| `arcane` | cheat product name | Arcane Unturned private cheat | Medium | [elitehacks.ru/en/cheat/unturned/arcane](https://elitehacks.ru/en/cheat/unturned/arcane); [wh-satano.ru/en/cheats/unturned](https://wh-satano.ru/en/cheats/unturned) |
| `loadercane` | loader archive/exe name | Arcane loader ("LoaderArcane.zip") | Medium | [Arcane Installation Guide ivsofte.biz](https://ivsofte.biz/en/articles/arcane-instructions/) |
| `novax` | cheat name / project name | Unturned-NovaX cheat | Medium | [GitHub GopelVexal/Unturned-NovaX](https://github.com/GopelVexal/Unturned-NovaX) |
| `projectlauncher` | loader exe name | NovaX / generic loader ("ProjectLauncher.exe") | Medium | [GitHub GopelVexal/Unturned-NovaX](https://github.com/GopelVexal/Unturned-NovaX) — low specificity, see note |
| `eggu` | alias (short form) | EgguWare Unturned cheat | Medium | [cheatermad.com EgguWare](https://cheatermad.com/egguware-unturned-multihack/) |
| `smgcheat` | cheat product name | SMG Unturned cheat | Medium | [cheatseller.com SMG](https://cheatseller.com/catalog/unturned/smg); [ownedcore.com SMG thread](https://www.ownedcore.com/forums/mmo-trading-market/fps-buy-sell-trade/1076135-cheats-unturned-smg-silent-aimbot-visible-check-visual-item-esp-misc.html) |
| `kakzy` | cheat marketplace / product name | Kakzy Unturned cheat | Medium | [kakzy.com Unturned](https://kakzy.com/unturned-cheats-hacks-309451/) |
| `loaderarcane` | loader zip/exe base name | Arcane loader | Medium | [ivsofte.biz Arcane instructions](https://ivsofte.biz/en/articles/arcane-instructions/) |
| `xenosinjector` | injector name | Xenos DLL Injector | High | [guidedhacking.com Xenos](https://guidedhacking.com/resources/xenos-injector-download-x86-x64-manual-mapper.693/) |
| `xenos64` | injector exe (x64 variant) | Xenos DLL Injector | High | [guidedhacking.com Xenos](https://guidedhacking.com/resources/xenos-injector-download-x86-x64-manual-mapper.693/); [Joe Sandbox Xenos](https://www.joesandbox.com/analysis/1850241/0/html) |
| `extremeinjector` | injector name / exe base | Extreme Injector | High | [GitHub master131/ExtremeInjector](https://github.com/master131/ExtremeInjector); [file.net process entry](https://www.file.net/process/extreme%20injector%20v3.exe.html) |
| `melonloader` | mod loader name / dll+exe | MelonLoader Unity mod loader (used as cheat delivery) | High | [Hybrid Analysis MelonLoader.ModHandler.dll](https://hybrid-analysis.com/sample/b04681c4b261fde80d2fadbbe8e3027facde0182c02e2058feae9ee73ee2bb33/5f7faf2fe7462b0e9a2dde78); [melonwiki.xyz](https://melonwiki.xyz/) |
| `titanium` | loader name / dll name | Titanium Unity assembly loader (Unturned) | Medium | [oldschoolhack.me Unturned downloads](https://www.oldschoolhack.me/en/downloads/unturned/60); [MPGH Titanium thread](https://www.mpgh.net/forum/showthread.php?t=843186) — see FP note |

---

## Rejected Candidates (false-positive risk)

| Candidate | Reason rejected |
|-----------|----------------|
| `loader` | Extremely generic; matches countless legitimate applications |
| `injector` | Generic; matches legitimate developer tools |
| `menu` | Generic; matches legitimate software (context menus etc.) |
| `client` | Generic; matches any game client, browser, etc. |
| `hack` | Short and common in legitimate words ("hackathon", "thicket" — depends on locale); not rejected outright if word-boundary matched, but not added here due to existing `aimbot`/`wallhack` coverage |
| `titanium` | Titanium is also a legitimate metalworking brand, software product, and common noun. Placed in `patterns` only because it is used as a distinctive Unity loader name in Unturned context, but it carries elevated FP risk for non-game file scanning. Admins should treat a single `titanium` hit as low-severity unless accompanied by other indicators. |
| `projectlauncher` | Too generic; any custom launcher project could use this name. NOT added to keywords. |
| `arcane` | Short word appearing in many legitimate contexts (game titles, product names). Placed in `exactMatch` only. |
| `novax` | Plausibly distinctive enough for `patterns` but also resembles product/company names; placed in `patterns` as compound string risk is low. |
| `processhacker` | ProcessHacker / System Informer is a legitimate Windows administration tool flagged by some anti-cheats. Risk of FP is significant. NOT added. |
| `x64dbg` | Legitimate reversing tool. NOT added. |
| `wireshark` | Legitimate network tool. NOT added. |
| `smg` | Too short; matches countless abbreviations. Only `smgcheat` (compound) added. |
| `mas` | Too short; three-letter abbreviation. NOT added. |
| `empty` | Single common English word. NOT added. |
| `harmony` | HarmonyLib is used by many legitimate Unity mods; adding it would catch innocent modded clients. NOT added. |
| `bepinex` | BepInEx is a legitimate mod framework; adding it would catch innocent modded clients. NOT added. |
