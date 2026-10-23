# Changelog

Each version's section is published as its GitHub release notes, and the app
shows it in the update dialog and under "What's new". Keep the `### New`,
`### Fixes` and `### Improvements` headings — the app groups entries by them.
Keep each entry to one line of about 100 characters so the dialog stays tidy.

## 3.2.1

### New
- Report a problem: a red button in the header (also during a scan) sends a note and the app's state to the team
- History: a checked player's earlier check from the same connection is marked, staff see the details on the site
- An ignored finding shows when it was ignored, and Restore is always one click away
- Error reports carry much more about the failure: step, slow scanners, processor, memory, system language

### Fixes
- Slow PCs: the registry, virtual machine and Recycle Bin checks no longer run out of time
- The time limit now reaches every check, so a slow disk can no longer hold a whole scan back
- A check that stopped early hands in what it found and says it was partial
- A result with no findings but several checks that did not run reads Incomplete, not Clean
- A damaged history index is rebuilt from the saved checks

### Improvements
- Detection base expanded: more leads for Unturned and Counter-Strike 2
- A timed-out check says where it stopped and how busy the PC was

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
- Counter-Strike 2: pick it in the game list; it has its own detection base and its own checks
- History tab: every check on the site, who checked whom, opens in the app (staff)
- Steam bans: each Steam account found on the PC shows its VAC and game bans
- New launch intro: the sword draws in, the name flies in, a live progress line follows the real startup steps
- System Compatibility card redesigned: ring, system chips, grouped checks, clear reasons when something is unavailable
- Results redesigned: risk ring, severity bar, tabs, searchable evidence list, scanner tiles
- A clean check shows a clear "nothing found" state instead of an empty list
- Settings redesigned: section rail, cards with icons, switch rows, refined language and theme pickers
- Dashboard: the compatibility read-out animates check by check, and the news card is taller and scrolls
- Utilities page redesigned
- Ambient background: soft drifting shapes in the theme colour, calmer on pages with content
- Error reports: errors and crashes go to the site so they can be fixed; never check results or names

### Fixes
- Detection fixes: some cheats were missed because of how their files and names were written
- A cancelled scan no longer leaves half-finished results on the Results screen
- A player name containing a percent sign no longer crashes the case page
- Desktop, Documents, Downloads, Pictures and Videos open correctly when OneDrive moved them
- Opening a saved check no longer looks like a finished scan
- The Steam bans card works on a PC with more than 10 Steam accounts
- A Windows account name with spaces or brackets is hidden whole in uploads
- A trick path ending in a dot segment can no longer pass as a folder when opening paths
- Fewer false alarms: a Windows account name is no longer reported as a lead
- A scheduled task's state is shown in English, whatever language Windows is set to
- The "Upload to site" button is gone: every check is saved to the site automatically
- Cancelling a scan stops the Windows tools it started at once
- Account names in paths on network shares (admin shares like C$) are hidden in uploads and error reports
- Browser leads are reported correctly for very long page titles
- A site check with malformed entries opens with those entries skipped instead of failing
- Regedit opens at the chosen key and gets its last-opened key back when Custos closes
- The EN / RU switch on the Dashboard news no longer jumps around
- A page that breaks shows an error with a Retry button instead of a blank window

### Improvements
- Manual check redesigned: search, tabs, a card per place that says what it shows and why to look
- Manual check: Windows traces, game logs/configs/addons, Steam accounts and logs, 15 more registry keys
- The scan's progress bar glides smoothly and never jumps, even when a scan is over in seconds
- Dates read day, month, year with a 24-hour clock instead of the American format
- A file-hash lead carries its full SHA-256, so a confirmed cheat file can be added to the base
- Detection improved: more spellings and variants are recognised
- Detection base expanded: new cheats, loaders and sites for Unturned and Counter-Strike 2
- Each game is checked against its own base, so one game's names never flag a player of the other
- Only Custos's own window can use its inner functions; one profile-name rule for uploads and reports
- Arrow keys work in the language and theme pickers and in tabs; reduced motion is respected
- The background animation pauses during a scan
- Detection lists ship inside each release and no longer update from the site

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
