# Maintaining cheat signatures

Custos matches artifacts against two bundled files in `resources/`.

## `keywords.json`

| Field | Matches | Use for |
|---|---|---|
| `patterns` | the word anywhere in a path, URL, name… (whole-word, trailing digits allowed: `Aimbot2.exe`) | distinctive cheat / loader names |
| `exactMatch` | only a file's exact base name (`esp.exe`, not `espresso.exe`) | short or ambiguous names |
| `games.<id>.patterns` / `.exactMatch` | same as above, grouped per game for maintenance | game-specific names |
| `games.<id>.domains` | the full domain (`xone.fun`, `gamesense.pub`) | brands whose name is a common word — the domain is unambiguous even when the word is not |

All sections are merged at load: a CS2 cheat found while checking for Unturned is still a lead.

**Before adding a name, check for false positives.** A plain word that is also a game, product or
common term must go in as a domain or `exactMatch`, never as a pattern. Examples kept out on purpose:
`gamesense` (SteelSeries GG component), `xone` (Xbox One drivers), `plague` (*A Plague Tale*),
`osiris`, `pandora`, `skeet`.

The 2026-09 additions were confirmed by web search (vendor sites, reseller listings and
review videos naming the product for CS2/Unturned): Aimware, Onetap, Gamesense/Skeet, ExLoader
(and ExHack, UwUware listed there), XONE, Plaguecheat for CS2; reseller/shop domains for Unturned.

## `hashes.json`

A match here is a **verified content match** and gives a **Critical** verdict on its own, so only add
hashes you have confirmed yourself — ideally by hashing the actual cheat file, or from a malware
database entry that names the cheat. Never add a hash from an unverified list.

```json
{
  "sha256": [],
  "entries": [
    {
      "sha256": "64 hex characters",
      "name": "Cheat name + version",
      "game": "unturned",
      "source": "where it was confirmed (URL / how)"
    }
  ]
}
```

Invalid digests are rejected at load time. To hash a file on Windows:
`Get-FileHash .\file.exe -Algorithm SHA256`.
