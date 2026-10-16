# Changelog

Each version's section is published as its GitHub release notes, and the app
shows it in the update dialog and under "What's new". Keep the `### New`,
`### Fixes` and `### Improvements` headings — the app groups entries by them.
Keep each entry to one line of about 100 characters so the dialog stays tidy.

## 3.2.0

### New
- Russian interface: switch the language in Settings; every screen, hint and scanner name is translated
- News in the app and on the site can be read in English or Russian, with a switch
- Case mode: all of a player's checks side by side, with what was cleaned between them
- Case package: one zip with every check, a summary and a SHA-256 list that proves nothing was edited
- Compare any two checks of a player, not only the last two
- The Dashboard shows the site's news, the same as the News page
- The Dashboard shows the website's 3D Custos sword, turning inside its rings in the theme colour
- Export HTML: a single printable report file you can open in a browser or send to a server owner
- Settings → About links to Custos Pro, the invite-only generation that continues Custos
- Counter-Strike 2: pick it in the game list; its own base holds cheats, loaders, forums and 80+ provider sites
- CS2 check reports the Steam launch options -insecure and -allow_third_party_software
- History tab: every check on the site, who checked whom, opens in the app (staff)
- Steam bans: each Steam account found on the PC shows its VAC and game bans
- Results redesigned: risk ring, severity bar, tabs, searchable evidence list, scanner tiles

### Fixes
- A Windows account named like a cheat (e.g. C:\Users\Mason) is no longer reported as a lead
- A scheduled task's state is shown in English, whatever language Windows is set to
- The "Upload to site" button is gone: every check is saved to the site automatically

### Improvements
- Dates read day, month, year with a 24-hour clock instead of the American format
- A file-hash lead carries its full SHA-256, so a confirmed cheat file can be added to the base
- Cheats are found under any spelling: "Cheat Engine", "cheat_engine", "spoofer_v2", "esp-setup"
- Added SharpMonoInjector and kdmapper, and the unknowncheats.me and mpgh.net forums, to the base
- Added Unturned cheats known from public source code: MSZ Reborn, CryEye, Tsunami, Uranus and others
- A check uses the base of the chosen game (plus the shared list), so a CS2 name never flags an Unturned player

## 3.1.1

### New
- Checks sent to the site no longer contain the player's Windows account name

### Fixes
- Windows tools always run from System32: a fake tasklist.exe next to Custos can't fake a scan
- A released build ignores WEB_BASE_URL / DESKTOP_AUTH_ENABLED set on the checked PC
- Detection lists are read from the integrity-checked app archive, not an editable copy in Temp
- Process, scheduled-task, Defender and window checks fail instead of showing "clean" when unread
- BAM entries show their real drive letter (C:\…) instead of \Device\HarddiskVolumeN
- Picking a new profile picture works again (the crop preview was blocked)
- Browser history is read in place: no copies of it are written to %TEMP%
- A stalled update download gives up after a minute instead of hanging
- Windows 11 25H2 is named correctly
- DNS check reads every cached record on any Windows language, and keeps failed lookups
- Slow checks keep what they found instead of losing it all at the time limit
- A PC with VMware Workstation installed is no longer reported as a virtual machine
- Exact-name cheats (e.g. spoofer.exe) are found in Amcache, and more findings correlate

### Improvements
- The USN journal is read from its newest end first
- A crafted browser log on the checked PC can no longer make Custos run out of memory

## 3.1.0

### New
- New look: the Noir theme (now the default), a redesigned side menu and a launch intro
- Menu click sound, with an on/off switch in Settings
- Every check is sent to the site, signed in or not, and later edits update the same check
- The player is detected from the Steam account on the PC and filled in for you
- Passwords, e-mail addresses and tokens found on the PC are hidden before a report leaves it
- Settings → About: version, official builds and license

### Fixes
- UserAssist and recent-document history in the registry are now really read
- USN journal and other Windows tools read correctly on Russian, German and other languages
- A PC with WSL2, Docker or VMware installed is no longer reported as a virtual machine
- Live Scan and the DNS check never show "clean" when the check could not run
- Cancelling a scan and starting again no longer fails with "already in progress"
- Windows installed on a drive other than C: is now scanned properly
- Fewer false alarms from Live Scan, folder names and Custos's own temp files
- Browser history still being written, deleted folders and Steam on any drive are found

### Improvements
- A failed scan shows its reason instead of returning to "Ready to scan"
- Crash dialog copies the log, so it can be sent before the file is cleaned up
- Live Scan no longer freezes the window while it reads the game's command line
- Manual check tiles keep full names in small windows

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
