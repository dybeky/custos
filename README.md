# Custos

[![GitHub release](https://img.shields.io/github/v/release/dybeky/custos)](https://github.com/dybeky/custos/releases)
[![CI](https://github.com/dybeky/custos/actions/workflows/ci.yml/badge.svg)](https://github.com/dybeky/custos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A Windows forensic anti-cheat scanner for Unturned servers.**

Custos helps server admins answer one question: *does this player's computer show signs that known cheating software was used on it?* It does this by reading the traces Windows leaves behind — even after a program has been deleted.

> ℹ️ *Custos in Latin means "guardian" or "watchman."*

---

## Table of contents

- [What is Custos?](#what-is-custos)
- [Before you start](#before-you-start)
- [Install Custos](#install-custos)
- [A quick tour of the app](#a-quick-tour-of-the-app)
- [Your first scan](#your-first-scan-step-by-step)
- [Reading your results](#reading-your-results)
- [Live Scan (advanced)](#live-scan-advanced)
- [What each scanner checks](#what-each-scanner-checks)
- [Extra tools: Manual & Utilities](#extra-tools-manual--utilities)
- [Settings](#settings)
- [Responsible use](#responsible-use)
- [Build from source](#build-from-source)

---

## What is Custos?

When someone runs a program on Windows — including a cheat — the operating system quietly records that it happened in dozens of different places: prefetch files, registry keys, recent-files lists, an execution log called BAM, the DNS cache, and more. These records often survive **even after the program itself is deleted.**

Custos is a desktop app that reads those records and looks for fingerprints of known cheats. It does **not** hook into the game or modify anything on the player's PC — it only *reads* what Windows already stored. The result is a structured report you can review and export.

> ⚠️ **Important to understand:** Custos finds *traces*, not proof. A finding means "something matched a known pattern and is worth a closer look" — not "this person is guilty." Always treat results as evidence to investigate, not as a verdict. See [Responsible use](#responsible-use).

There are two kinds of scan:

| Scan type | What it does | Needs the game open? |
|---|---|---|
| **Forensic scan** | Reads Windows history/artifacts to find traces of past cheat use. This is the main feature. | No |
| **Live Scan** | Inspects the running game's memory in real time for active tampering. Advanced and optional. | Yes |

---

## Before you start

Please read this short checklist before running Custos:

- 🪟 **Windows only.** Custos reads Windows-specific artifacts. It will not work on macOS or Linux.
- 🛡️ **Run as Administrator.** Many of the most useful artifacts (Prefetch, the BAM registry, process command lines) are protected by Windows. Without admin rights, those scanners will return "access denied" and you'll get an incomplete picture.
- 🤝 **Get consent.** Only scan a machine when the player has agreed, or when your server rules clearly require forensic review as a condition of play.

---

## Install Custos

1. Go to the releases page: **[github.com/dybeky/custos/releases](https://github.com/dybeky/custos/releases)**
2. Download the latest installer.
3. **Right-click the installer → "Run as administrator."**
4. Follow the prompts. When Custos launches, it will ask you to **pick a game** (Unturned is supported today; Counter-Strike 2 is marked *coming soon*).

That's it — you're ready to scan.

---

## A quick tour of the app

Custos has a slim **icon-only sidebar** down the left edge. Hover any icon to see its name. Here's what each page is for:

| Page | What you use it for |
|---|---|
| 🏠 **Dashboard** | Your home screen. Shows the app version, what features your system supports, and a live changelog of updates. |
| 🔍 **Scan** | The main event — runs all the forensic scanners and shows live progress. |
| ⚡ **Live Scan** | Advanced. Inspects the running game's memory in real time (Windows + game open required). |
| 📋 **Results** | Review findings from your last scan and export them. A small badge shows the total finding count. |
| 🧭 **Manual** | One-click shortcuts to open Windows folders, registry keys, and reference links by hand. |
| 🧰 **Utilities** | Links to trusted third-party forensic tools that complement Custos. |
| ⚙️ **Settings** | Appearance and app preferences. |

---

## Your first scan (step by step)

This is the core workflow. It takes under a minute.

1. **Open the Scan page** from the sidebar (the magnifying-glass icon).
2. The page tells you how many scanners are ready to run. Click the big **Start Scan** button in the center.
3. Watch the progress:
   - A **circular indicator** in the middle shows overall completion as a percentage.
   - Below it, **every scanner is listed**. Each one shows its state:
     - ⏳ *Pending* — waiting its turn
     - 🔄 *Active* — currently running
     - ✅ *Done* — finished (if it found something, a **count badge** replaces the checkmark)
4. When everything finishes, the status changes to **Scan Complete** and the total number of findings is shown.
5. Click through to **Results** to review what was found.

> 💡 **Need to stop early?** Click **Cancel Scan** at any time. Custos stops cleanly and won't leave a scan stuck running.

Scanners run in smart batches in the background, and each one has a built-in time limit so a single slow scanner can't freeze the whole run.

---

## Reading your results

Open the **Results** page after a scan.

### The summary card

At the top you'll see one of two things:

- ✅ **Green** — no findings were detected.
- 🔴 **Red, with a count** — one or more findings exist and deserve a look.

### Per-scanner findings

Below the summary, each scanner gets its own **collapsible card**. Click a card to expand it and see that scanner's individual findings — file paths, registry values, or other strings — shown in an easy-to-read monospace font. Each card also shows how long that scanner took.

### How to interpret findings

> ⚠️ A finding is a **lead, not a conviction.** A matched keyword might be an actual cheat — or a file with a coincidentally similar name, an old leftover, or something harmless. Read the actual path or value, consider the context, and corroborate with more than one scanner before drawing a conclusion.

### Exporting your report

Two buttons appear once results exist:

| Button | File | Best for |
|---|---|---|
| **Export Results** | `custos-scan-YYYY-MM-DD.txt` | A quick, human-readable summary you can paste into a ticket or chat. |
| **Export JSON** | `custos-scan-YYYY-MM-DD.json` | A structured file (scanner name, success flag, findings, duration, errors) for records or further processing. |

---

## Live Scan (advanced)

**Live Scan** is a separate, optional feature that looks at the **running game's memory** for active tampering — injected modules, code hooks, suspicious threads, and similar. It's powerful but has strict requirements.

For Live Scan to be available, **all four** of these must be true:

1. ✅ You're on **Windows**.
2. ✅ The native memory module is installed (see [Native module](#native-module-windows-only)).
3. ✅ The **game is currently running**.
4. ✅ Custos is running as **Administrator** (needed to read another process's memory).

The Live Scan page shows a status banner telling you exactly where you stand — for example *Checking Status*, *Windows Only*, *Native Unavailable*, *Game Not Running*, or *Ready*. When it says **Ready**, start the scan and Custos will stream each detector's progress and findings as they're discovered. Each finding is labeled with a confidence level (**high**, **suspicious**, or **info**) to help you prioritize.

> ℹ️ If Live Scan is unavailable, that's fine — every forensic scanner on the main **Scan** page still works without it.

---

## What each scanner checks

A full forensic scan runs **16 scanners**. Here's what each one inspects, in plain language:

| Scanner | What it looks at |
|---|---|
| **AppData Scanner** | AppData folders, searched by known cheat keywords. |
| **Prefetch Scanner** | The Windows Prefetch folder, which records what programs have run. |
| **Recent Files Scanner** | The list of recently accessed files. |
| **Game Folder Scanner** | The game's installation directories. |
| **Registry Scanner** | Registry keys that track program use (MuiCache, AppSwitched, ShowJumpView). |
| **Browser History Scanner** | Browser history and caches, searched by keyword (e.g. visits to cheat sellers). |
| **Process Scanner** | Currently running processes, including their paths and command lines. |
| **Steam Scanner** | Steam accounts and folders. |
| **Amcache Scanner** | Amcache, a Windows store of program execution history. |
| **BAM/DAM Scanner** | The Background Activity Moderator log — a record of recently executed programs. |
| **Shellbags Scanner** | Shellbags, which record which folders have been opened. |
| **VM Scanner** | Signs that the machine is a virtual machine or sandbox (a common way to hide activity). |
| **DNS Cache Scanner** | The Windows DNS cache, for suspicious domain lookups. |
| **Scheduled Tasks Scanner** | The Task Scheduler, for entries used to keep cheats running (persistence). |
| **File Hash Scanner** | SHA-256 fingerprints of files in Downloads, Desktop, and Temp, checked against a list of known cheat hashes. |
| **Window & Module Scanner** | Window titles and loaded modules of running programs, checked against the keyword list. |

---

## Extra tools: Manual & Utilities

These two pages support hands-on investigation when you want to look around yourself.

### Manual — one-click shortcuts

The **Manual** page opens common investigation targets with a single click, organised into six categories:

- **System Tools** — Windows settings shortcuts: *Data Usage* and *Windows Defender*.
- **Folders** — opens common directories in File Explorer: *Videos, Downloads, AppData, LocalAppData, Prefetch, OneDrive*.
- **Games** — opens the default *Unturned* and *Steam* install folders.
- **Registry** — opens key forensic registry paths directly in regedit (MuiCache, AppSwitched, ShowJumpView, AppBadgeUpdated, AppLaunch, RunMRU, UserAssist, AppCompatFlags, Compatibility Assistant Store).
- **Telegram Cheat Bots** — reference links to known Unturned cheat-seller bots, for context.
- **Additional Resources** — reference links to common cheat marketplaces (Oplata.info, FunPay.com).

### Utilities — trusted third-party tools

The **Utilities** page links to five well-known forensic tools that pair nicely with Custos. Clicking one opens its official download page in your browser:

- **LastActivityView** (NirSoft) — a timeline of recent system activity.
- **USBDeview** (NirSoft) — history of USB devices that have been plugged in.
- **Everything** (voidtools) — instant filesystem search.
- **System Informer** — advanced process and system inspection.
- **ShellBag Analyzer & Cleaner** (Privazer) — dedicated shellbag inspection.

---

## Settings

The **Settings** page currently houses **Appearance** — a showcase of the accent colours the interface uses. Custos also ships with English and Russian language support.

> 🗒️ **Note:** Earlier versions had a "Danger Zone" that could delete the app after a scan. That feature has been **removed** — Custos no longer deletes itself or any of your files.

---

## Responsible use

Custos is a powerful tool. Please use it responsibly:

- **Findings are leads, not proof.** A trace means "investigate further," never "guilty." Don't ban on a single keyword match.
- **Get consent.** Only run Custos on a machine where the player has agreed, or where your server rules explicitly authorise forensic review as a condition of play.
- **Respect the law and your jurisdiction.** Informed consent and your local rules come first.
- **Custos requires Administrator rights** to read protected Windows artifacts. It is intended solely for legitimate moderation of Unturned servers.

---

## Build from source

*This section is for developers and contributors. If you just want to use Custos, grab the installer from [Releases](https://github.com/dybeky/custos/releases) instead.*

Custos is an Electron app built with React, TypeScript, Vite, Tailwind CSS, and Zustand.

```bash
git clone https://github.com/dybeky/custos.git
cd custos
npm install

# development mode (hot-reload)
npm run dev

# production build for Windows
npm run package:win
```

- **Requirements:** Node.js 20+. The final packaged build needs a Windows environment (or a `windows-latest` CI runner).
- **Cross-platform checks:** `npm run typecheck` and `npm run build` both work on any OS.
- **Tests:** `npm test` (Vitest). Coverage via `npm run test:coverage`.

### Native module (Windows only)

The Live Scan feature depends on `memoryjs`, a native addon that must be compiled against Electron's ABI. On Windows, run this after `npm install`:

```bash
npm run rebuild
```

On non-Windows hosts you can skip this — Live Scan will report "native unavailable," but **all 16 forensic scanners remain fully functional.**

---

## Disclaimer

Custos requires Administrator rights to access protected Windows artifacts. It is intended solely for legitimate moderation of Unturned servers. Use it only on machines where you have obtained the player's informed consent, or where your server rules explicitly authorise forensic review as a condition of play.
