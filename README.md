# Custos

[![GitHub release](https://img.shields.io/github/v/release/dybeky/custos)](https://github.com/dybeky/custos/releases)
[![CI](https://github.com/dybeky/custos/actions/workflows/ci.yml/badge.svg)](https://github.com/dybeky/custos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Windows forensic anti-cheat scanner for Unturned servers.

---

## what is custos

Custos is a desktop application for Unturned server administrators who need to investigate whether a player's machine carries traces of known cheating software. Rather than hooking into a game process, Custos performs a **forensic scan** — it inspects Windows OS artifacts that persist after a program has been used: prefetch files, registry execution keys, AppData folders, browser history, the Windows BAM/DAM log, shellbags, the DNS cache, and more. The scan produces a structured report that can be exported and reviewed.

The name means "guardian" or "watchman" in Latin.

---

## download & install

Download the latest installer from the GitHub Releases page:

**[github.com/dybeky/custos/releases](https://github.com/dybeky/custos/releases)**

Run the installer as **Administrator**. Custos requires elevated privileges to read protected OS artifacts such as Prefetch, the BAM registry hive, and process command lines.

---

## run your first scan

1. Launch Custos. The **Dashboard** opens by default.
2. Navigate to the **Scan** page using the sidebar.
3. The page shows how many scanners are ready. Click **Start Scan**.
4. A circular progress indicator shows overall completion percentage. Below it, each scanner is listed with its current state — pending, active (with its own percentage), or complete. When a scanner finishes with findings, the count of findings is shown in place of the checkmark.
5. When all scanners finish, the status changes to **Scan Complete** and the total number of findings is displayed. Navigate to **Results** to review them.

You can click **Cancel Scan** at any time to stop the run early.

---

## reading results

The **Results** page shows a summary card at the top: green if no findings were detected, red with a count if findings exist.

Below the summary, each scanner has its own collapsible card. Click a card to expand it and see the individual findings — file paths, registry values, or other strings — displayed in a monospace font. The duration of each scanner run is shown in milliseconds.

Two export buttons are available once results exist:

- **Export Results** — downloads a plain-text file (`custos-scan-<date>.txt`) with each scanner's findings listed under a header.
- **Export JSON** — downloads a structured JSON file (`custos-scan-<date>.json`) containing scanner name, success flag, findings array, duration, and any error message for each scanner.

---

## what each scanner checks

Custos runs 14 scanners in sequence. All scanner names and descriptions are taken directly from the source.

| Scanner | What it inspects |
|---|---|
| AppData Scanner | Scanning AppData folders by keywords |
| Prefetch Scanner | Scanning Windows Prefetch folder |
| Recent Files Scanner | Scanning recently accessed files |
| Game Folder Scanner | Scanning game installation directories |
| Registry Scanner | Registry search by keywords (MuiCache, AppSwitched, ShowJumpView) |
| Browser History Scanner | Deep search of browser history and caches by keywords |
| Process Scanner | Scanning running processes with paths and command lines |
| Steam Scanner | Scanning Steam accounts and folders |
| Amcache Scanner | Scanning Amcache for program execution history |
| BAM/DAM Scanner | Scanning Background Activity Moderator for execution history |
| Shellbags Scanner | Scanning Shellbags for folder access history |
| VM Scanner | Detection of virtual machines and sandbox environments |
| DNS Cache Scanner | Scanning Windows DNS cache for suspicious domain resolutions |
| Scheduled Tasks Scanner | Scanning Windows Task Scheduler for suspicious persistence entries |

---

## settings & utilities

### settings

The **Settings** page has two sections:

- **Appearance** — shows the four accent colours used by the interface (Lavender, Purple, Sky, Blue).
- **Danger Zone** — a toggle to automatically delete the Custos executable after the scan completes, and a button to delete the program immediately. Both actions require confirmation.

### utilities

The **Utilities** page links to five external forensic tools that complement a Custos scan:

- **LastActivityView** (NirSoft) — shows recent system activity from multiple sources.
- **USBDeview** (NirSoft) — lists USB devices that have been connected to the machine.
- **Everything** (voidtools) — fast filesystem search.
- **System Informer** — advanced process and system information viewer.
- **ShellBag Analyzer** (Privazer) — dedicated shellbag inspection tool.

Clicking a tool opens its download page in the system browser.

### manual

The **Manual** page is a quick-launch panel for common investigation steps. It is organised into six categories:

- **System Tools** — one-click launch of Windows settings URIs (Data Usage, Windows Defender).
- **Folders** — opens common directories in Explorer using environment variable paths (Videos, Downloads, AppData, LocalAppData, Prefetch, OneDrive).
- **Games** — opens the default Unturned and Steam installation directories.
- **Registry** — opens registry paths directly in regedit (MuiCache, AppSwitched, ShowJumpView, AppBadgeUpdated, AppLaunch, RunMRU, UserAssist, AppCompatFlags, Compatibility Assistant Store).
- **Telegram Cheat Bots** — links to known Unturned cheat seller Telegram bots for reference.
- **Additional Resources** — links to Oplata.info and FunPay.com (common cheat marketplaces).

---

## build from source

```bash
git clone https://github.com/dybeky/custos.git
cd custos
npm install

# development mode (hot-reload)
npm run dev

# production build for Windows
npm run package:win
```

Requires Node.js 20 and a Windows environment (or a CI runner with `windows-latest`) for the final packaged build. `npm run typecheck` and `npm run build` work cross-platform.

### Native module (Windows only)

The live-memory scanner depends on `memoryjs`, a native addon that must be
compiled against Electron's ABI. On Windows, run this after `npm install`:

```bash
npm run rebuild
```

On non-Windows hosts this step can be skipped — the live-scan feature will
report "native unavailable" but all forensic scanners remain fully functional.

---

## disclaimer

Custos requires Administrator rights to access protected Windows artifacts. It is intended solely for legitimate moderation of Unturned servers. Use it only on machines where you have obtained the player's informed consent or where your server rules explicitly authorise forensic review as a condition of play.
