# Changelog

Each version's section is published as its GitHub release notes, and the app
shows it in the update dialog and under "What's new". Keep the `### New`,
`### Fixes` and `### Improvements` headings — the app groups entries by them.
Keep each entry to one line of about 100 characters so the dialog stays tidy.

## 3.0.0

### New
- Clear risk verdict (Clean to Critical) with a 0–100 score, the reason, key evidence and a timeline
- Custos sign-in: upload a check to 97437.dev and see a player's history across checkers
- Detection signatures update from the site between releases, signed and verified by the app
- Update now: one click downloads, verifies (SHA-256) and installs a new version — or later, if you prefer
- New scanners: Defender history, Recycle Bin, USB history, USN journal, anti-forensics and more
- Saved checks with history, re-check comparison and a case card for player, checker and notes
- Triage: dismiss a false positive, ignore a signature, reveal a file in Explorer
- Report export as a readable forensic report or JSON, with an integrity hash
- Four color themes — Violet (default), Espresso, Graphite and Emerald
- Windows on ARM build (custos-arm64.exe)

### Fixes
- Live Scan now works in release builds — it could not load before
- Everyday words (song titles, film names, program folders) no longer show up as cheat leads
- Unturned and Steam folders are found on any drive, not only the default path
- Results no longer say "No threats found" before a check has run
- Scan state stays in sync across pages and after cancelling
- Sign-in no longer hangs on slow or flaky networks

### Improvements
- Leaves nothing behind: settings, login, checks and logs are wiped when Custos closes
- Many visits to the same cheat site fold into one timeline row
- Faster scanning: folders and files are read in the background
- Clearer startup and crash messages, with a fix link when the cause is known
- Hardened build: the exe only runs its own verified code and can't be used as a debugger target
- Wider update dialog with the full changelog; no website promotion inside the app
- Cleaner interface with one layout and readable type throughout
