# Changelog

Each version's section is published as its GitHub release notes, and the app
shows it in the update dialog and under "What's new". Keep the `### New`,
`### Fixes` and `### Improvements` headings — the app groups entries by them.

## 3.0.0

### New
- Clear risk verdict (Clean to Critical) with a 0–100 score, the reason, key evidence and an activity timeline
- Custos sign-in: upload a check to 97437.dev and see a player's history across checkers
- Detection signatures update from the site between releases, signed and verified by the app
- Update now: new versions download, are checked against their published SHA-256 and install with one click — or later, whenever you choose
- New scanners: Defender history, Recycle Bin, USB history, USN journal, anti-forensics and switched-off Windows components
- Saved checks with history, re-check comparison and a case card for player, checker and notes
- Triage: dismiss a false positive, ignore a signature, reveal a file in Explorer
- Report export as a readable forensic report or JSON, with an integrity hash
- Four color themes: Espresso, Graphite, Emerald and Violet
- Windows on ARM build (custos-arm64.exe)

### Fixes
- Live Scan now works in release builds — it could not load before
- Everyday words (song titles, film names, program folders) no longer show up as cheat leads
- Unturned and Steam folders are found on any drive, not only the default path
- Results no longer say "No threats found" before a check has run
- Scan state stays in sync across pages and after cancelling
- Sign-in no longer hangs on slow or flaky networks

### Improvements
- Leaves nothing behind: settings, login, saved checks and logs live in a temporary folder that is wiped when Custos closes
- Many visits to the same cheat site fold into one timeline row
- Faster scanning: folders and files are read in the background
- Clearer startup and crash messages, with a fix link when the cause is known
- Hardened build: the exe can't be repurposed as a script runner or debugger target and only runs its own verified code
- Cleaner interface with one layout and readable type throughout
