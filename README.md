# Custos — Руководство по проверке игроков / Player Verification Guide

> **Custos** — программа для обнаружения стороннего ПО (читов) на серверах COBRA (Unturned).
>
> **Custos** — a tool for detecting third-party software (cheats) on COBRA servers (Unturned).

---

# Содержание / Table of Contents

- [Русский](#-руководство-на-русском)
- [English](#-english-guide)

---

# 🇷🇺 Руководство на русском

## Введение

**Custos** — десктопное приложение для администраторов и модераторов серверов COBRA. Программа помогает обнаруживать следы читерского ПО на компьютере проверяемого игрока.

### Требования

- **ОС:** Windows 10/11
- **Права:** Запуск от имени администратора (для доступа к системным папкам и реестру)
- **Интернет:** Требуется для обновлений и загрузки утилит

## Быстрый старт

1. Запустите **Custos** от имени администратора
2. Слева расположена боковая панель навигации:
   - **Dashboard** — главная страница с информацией и changelog
   - **Scan** — автоматическое сканирование
   - **Results** — результаты сканирования
   - **Manual** — ручная проверка
   - **Utilities** — вспомогательные утилиты
   - **Settings** — настройки программы

### Порядок проверки

| Шаг | Вкладка | Описание |
|-----|---------|----------|
| 1 | Scan | Автоматическое сканирование системы |
| 2 | Results | Просмотр результатов автоскана |
| 3 | Manual | **Обязательная** ручная проверка |
| 4 | Utilities | Дополнительные инструменты при необходимости |

---

## Шаг 1: Автоматический скан (вкладка Scan)

### Как запустить

1. Перейдите на вкладку **Scan**
2. Нажмите кнопку **START SCAN**
3. Дождитесь завершения — прогресс отображается в процентах для каждого сканера

### Что проверяется автоматически

Custos запускает **12 сканеров** последовательно:

| # | Сканер | Что делает |
|---|--------|------------|
| 1 | **AppData Scanner** | Сканирует папки AppData (Roaming/Local) по ключевым словам — ищет конфиги, логи и остатки читов |
| 2 | **Prefetch Scanner** | Проверяет папку Windows Prefetch — здесь хранятся следы всех запущенных программ |
| 3 | **Recent Files Scanner** | Сканирует недавно открытые файлы — показывает что запускал пользователь |
| 4 | **Game Folder Scanner** | Проверяет директории установки игр на подозрительные файлы |
| 5 | **Registry Scanner** | Поиск по реестру Windows по ключевым словам (MuiCache, AppSwitched, ShowJumpView) |
| 6 | **Browser History Scanner** | Глубокий поиск по истории браузеров и кешу по ключевым словам |
| 7 | **Process Scanner** | Сканирует запущенные процессы с путями и командными строками |
| 8 | **Steam Scanner** | Проверяет аккаунты Steam и связанные папки |
| 9 | **Amcache Scanner** | Сканирует Amcache — системный журнал истории запуска программ |
| 10 | **BAM/DAM Scanner** | Проверяет Background Activity Moderator — ещё один источник истории запусков |
| 11 | **Shellbags Scanner** | Анализирует Shellbags — записи Windows о доступе к папкам |
| 12 | **VM Scanner** | Обнаружение виртуальных машин и sandbox-окружений |

### Как читать результаты (вкладка Results)

После завершения скана перейдите на вкладку **Results**:

- **Зелёная иконка (галочка)** — сканер ничего не нашёл
- **Красная иконка (число)** — количество найденных подозрительных элементов
- Нажмите на любой сканер, чтобы раскрыть список находок
- Сводка вверху показывает общее количество обнаружений

### Экспорт результатов

Нажмите кнопку **EXPORT RESULTS** на странице Results — файл сохранится в формате `.txt` с именем `custos-scan-ГГГГ-ММ-ДД.txt`.

---

## Шаг 2: Ручная проверка (вкладка Manual) — ОБЯЗАТЕЛЬНЫЙ ЭТАП

> **Автоскан НЕ находит всё.** Многие читы не оставляют следов, видимых автоматическому сканированию. Ручная проверка — обязательный этап каждой проверки. Проходите все пункты сверху вниз.

### System Tools (Системные инструменты)

| Инструмент | Зачем |
|------------|-------|
| **Data Usage** | Открывает настройки использования данных Windows. Позволяет увидеть какие приложения использовали интернет — подозрительный трафик может указывать на читы с онлайн-активацией |
| **Windows Defender** | Открывает Защитник Windows. Проверьте историю угроз — читы часто определяются как вредоносное ПО и пользователь мог их разрешить |

### Folders (Папки)

Custos открывает каждую папку одним нажатием. Что искать:

| Папка | Путь | Что искать |
|-------|------|------------|
| **Videos** | `%USERPROFILE%\Videos` | Записи экрана с читами, туториалы, демонстрации |
| **Downloads** | `%USERPROFILE%\Downloads` | Скачанные архивы/установщики читов, подозрительные .exe/.dll/.rar файлы |
| **AppData** | `%APPDATA%` | Конфиги читов, логи, папки с подозрительными названиями |
| **LocalAppData** | `%LOCALAPPDATA%` | Аналогично AppData — часть читов хранит данные здесь |
| **Prefetch** | `C:\Windows\Prefetch` | Файлы .pf с именами запускавшихся программ — ищите подозрительные имена |
| **OneDrive** | `%USERPROFILE%\OneDrive` | Игроки иногда хранят читы в облаке для быстрого восстановления |

### Games (Игровые папки)

| Папка | Путь | Что искать |
|-------|------|------------|
| **Unturned** | `C:\Program Files (x86)\Steam\steamapps\common\Unturned` | Посторонние .dll файлы, инжекторы, модифицированные файлы игры |
| **Steam** | `C:\Program Files (x86)\Steam` | Подозрительные программы в корне Steam, модифицированные файлы клиента |

### Registry (Реестр)

Custos открывает ключи реестра одним нажатием. Каждый ключ хранит важную информацию:

| Ключ | Что показывает |
|------|---------------|
| **MuiCache** | Кеш названий запущенных программ — ищите подозрительные имена в описаниях |
| **AppSwitched** | История переключений между приложениями — показывает какие программы использовались одновременно с игрой |
| **ShowJumpView** | Записи JumpList — какие приложения появлялись в панели задач |
| **AppBadgeUpdated** | Уведомления приложений — какие программы отправляли уведомления |
| **AppLaunch** | Прямая история запуска приложений — один из самых полезных ключей |
| **RunMRU** | История команд из диалога "Выполнить" (Win+R) — пользователи иногда запускают читы через него |
| **UserAssist** | Зашифрованный (ROT13) лог всех запущенных программ с количеством запусков и временем |
| **AppCompatFlags** | Флаги совместимости — показывает программы, запущенные в режиме совместимости (читы часто требуют этого) |
| **Compatibility Assistant** | Лог помощника совместимости — фиксирует программы, которые вызвали проблемы совместимости |

### Telegram Cheat Bots

Проверьте, взаимодействовал ли пользователь с известными ботами по продаже читов:

- **@undeadsellerbot**
- **@MelonySolutionBot**

Custos откроет их в браузере — проверьте есть ли история переписки на компьютере пользователя.

### Additional Resources (Дополнительные ресурсы)

Проверьте историю посещений этих сайтов в браузере пользователя:

- **Oplata.info** — платформа для покупки цифровых товаров, включая читы
- **FunPay.com** — маркетплейс где продаются аккаунты и читы

---

## Шаг 3: Утилиты (вкладка Utilities)

Дополнительные инструменты для углублённой проверки. Каждая утилита скачивается с официального сайта.

| Утилита | Описание | Когда использовать |
|---------|----------|-------------------|
| **LastActivityView** | Показывает журнал активности компьютера: запуск программ, операции с файлами и многое другое | Когда нужно восстановить полную хронологию действий пользователя |
| **USBDeview** | Список всех USB-устройств, когда-либо подключённых к компьютеру, с датами | Когда подозреваете что читы запускались с флешки |
| **Everything** | Мгновенный поиск файлов по всем дискам | Когда нужно найти конкретный файл по имени — ищите по ключевым словам читов |
| **System Informer** | Продвинутый мониторинг системы и просмотр процессов (ранее Process Hacker) | Когда нужно проверить запущенные процессы, DLL, сетевые соединения в реальном времени |
| **ShellBag Analyzer** | Анализирует записи Windows ShellBag, хранящие историю доступа к папкам | Когда нужно увидеть к каким папкам обращался пользователь, даже если они были удалены |

---

## Шаг 4: Принятие решения

### Если нашли подозрительное

1. Зафиксируйте находки (экспорт результатов / скриншоты)
2. Сопоставьте данные из разных источников (автоскан + ручная проверка + утилиты)
3. Передайте информацию старшему администратору при необходимости
4. Примите решение согласно правилам сервера

### Если ничего не найдено

- Автоскан чистый **И** ручная проверка чистая **И** утилиты ничего не показали → **отпустите игрока**
- Не задерживайте игрока без оснований

---

## Важные заметки

### Ключевые слова автоскана

Автоматический скан ищет файлы и записи по следующим паттернам:

**По вхождению подстроки:**

`undead`, `melony`, `fecurity`, `ancient`, `medusa`, `mason`, `midnight`, `fatality`, `memesense`, `xnor`, `aimbot`, `wallhack`, `triggerbot`, `norecoil`, `speedhack`, `hwid_spoofer`, `unturned_cheat`, `unturnedcheat`, `unturnex`, `uloader`, `ucheats`, `utools`, `cheatengine`, `megadumper`, `extremedumper`, `neverlose`, `nixware`

**По точному совпадению:**

`esp`, `hwid`, `spoofer`

### Обнаружение виртуальных машин

VM Scanner автоматически определяет запуск внутри виртуальной машины. Если пользователь запускает систему в ВМ — это серьёзный красный флаг, так как ВМ используют для сокрытия следов читов на основной системе.

### Обучение

Если вы новый администратор или модератор и не проходили обучение по проверке игроков — **обратитесь к старшим администраторам**. Они должны провести обучение и объяснить все нюансы.

---

## Настройки (Settings)

| Настройка | Описание |
|-----------|----------|
| **Theme** | Выбор темы оформления (Aurora, Monochrome, Tropical) |
| **Language** | Выбор языка интерфейса |
| **Check for updates on startup** | Автоматическая проверка обновлений при запуске |
| **Auto-download updates** | Автоматическая загрузка обновлений |
| **Delete program after use** | Автоматическое удаление Custos при закрытии |
| **DELETE PROGRAM NOW** | Немедленное удаление программы |

---
---

# 🇬🇧 English Guide

## Introduction

**Custos** is a desktop application for administrators and moderators of COBRA servers. The program helps detect traces of cheat software on a player's computer during verification.

### Requirements

- **OS:** Windows 10/11
- **Privileges:** Run as Administrator (for access to system folders and registry)
- **Internet:** Required for updates and utility downloads

## Quick Start

1. Launch **Custos** as Administrator
2. The sidebar navigation is on the left:
   - **Dashboard** — home page with info and changelog
   - **Scan** — automatic scanning
   - **Results** — scan results
   - **Manual** — manual verification
   - **Utilities** — helper utilities
   - **Settings** — app settings

### Verification Order

| Step | Tab | Description |
|------|-----|-------------|
| 1 | Scan | Automatic system scan |
| 2 | Results | Review auto-scan results |
| 3 | Manual | **Mandatory** manual check |
| 4 | Utilities | Additional tools as needed |

---

## Step 1: Automatic Scan (Scan Tab)

### How to Run

1. Navigate to the **Scan** tab
2. Click the **START SCAN** button
3. Wait for completion — progress is shown as a percentage for each scanner

### What Gets Scanned Automatically

Custos runs **12 scanners** sequentially:

| # | Scanner | What It Does |
|---|---------|-------------|
| 1 | **AppData Scanner** | Scans AppData folders (Roaming/Local) by keywords — looks for configs, logs, and cheat remnants |
| 2 | **Prefetch Scanner** | Checks Windows Prefetch folder — stores traces of all executed programs |
| 3 | **Recent Files Scanner** | Scans recently accessed files — shows what the user has opened |
| 4 | **Game Folder Scanner** | Checks game installation directories for suspicious files |
| 5 | **Registry Scanner** | Searches Windows Registry by keywords (MuiCache, AppSwitched, ShowJumpView) |
| 6 | **Browser History Scanner** | Deep search of browser history and caches by keywords |
| 7 | **Process Scanner** | Scans running processes with their paths and command lines |
| 8 | **Steam Scanner** | Checks Steam accounts and associated folders |
| 9 | **Amcache Scanner** | Scans Amcache — a system log of program execution history |
| 10 | **BAM/DAM Scanner** | Checks Background Activity Moderator — another source of execution history |
| 11 | **Shellbags Scanner** | Analyzes Shellbags — Windows records of folder access |
| 12 | **VM Scanner** | Detection of virtual machines and sandbox environments |

### Reading Results (Results Tab)

After the scan completes, navigate to the **Results** tab:

- **Green icon (checkmark)** — scanner found nothing
- **Red icon (number)** — number of suspicious items found
- Click any scanner to expand its findings list
- The summary at the top shows the total detection count

### Exporting Results

Click the **EXPORT RESULTS** button on the Results page — the file will be saved as `.txt` named `custos-scan-YYYY-MM-DD.txt`.

---

## Step 2: Manual Check (Manual Tab) — MANDATORY STEP

> **The auto-scan does NOT find everything.** Many cheats leave no traces visible to automatic scanning. Manual verification is a mandatory step in every check. Go through all items from top to bottom.

### System Tools

| Tool | Purpose |
|------|---------|
| **Data Usage** | Opens Windows Data Usage settings. Shows which applications used the internet — suspicious traffic may indicate cheats with online activation |
| **Windows Defender** | Opens Windows Defender. Check the threat history — cheats are often detected as malware and the user may have allowed them |

### Folders

Custos opens each folder with a single click. What to look for:

| Folder | Path | What to Look For |
|--------|------|-----------------|
| **Videos** | `%USERPROFILE%\Videos` | Screen recordings of cheats, tutorials, demonstrations |
| **Downloads** | `%USERPROFILE%\Downloads` | Downloaded cheat archives/installers, suspicious .exe/.dll/.rar files |
| **AppData** | `%APPDATA%` | Cheat configs, logs, folders with suspicious names |
| **LocalAppData** | `%LOCALAPPDATA%` | Same as AppData — some cheats store data here |
| **Prefetch** | `C:\Windows\Prefetch` | .pf files with names of executed programs — look for suspicious names |
| **OneDrive** | `%USERPROFILE%\OneDrive` | Players sometimes store cheats in the cloud for quick restoration |

### Games

| Folder | Path | What to Look For |
|--------|------|-----------------|
| **Unturned** | `C:\Program Files (x86)\Steam\steamapps\common\Unturned` | Foreign .dll files, injectors, modified game files |
| **Steam** | `C:\Program Files (x86)\Steam` | Suspicious programs in Steam root, modified client files |

### Registry

Custos opens registry keys with a single click. Each key stores important information:

| Key | What It Shows |
|-----|--------------|
| **MuiCache** | Cache of executed program names — look for suspicious names in descriptions |
| **AppSwitched** | Application switching history — shows what programs were used alongside the game |
| **ShowJumpView** | JumpList records — which applications appeared in the taskbar |
| **AppBadgeUpdated** | Application notifications — which programs sent notifications |
| **AppLaunch** | Direct application launch history — one of the most useful keys |
| **RunMRU** | Command history from the Run dialog (Win+R) — users sometimes launch cheats through it |
| **UserAssist** | Encrypted (ROT13) log of all executed programs with launch counts and timestamps |
| **AppCompatFlags** | Compatibility flags — shows programs run in compatibility mode (cheats often require this) |
| **Compatibility Assistant** | Compatibility assistant log — records programs that caused compatibility issues |

### Telegram Cheat Bots

Check if the user has interacted with known cheat-selling bots:

- **@undeadsellerbot**
- **@MelonySolutionBot**

Custos will open them in the browser — check if there's any chat history on the user's computer.

### Additional Resources

Check the user's browser history for visits to these sites:

- **Oplata.info** — a platform for purchasing digital goods, including cheats
- **FunPay.com** — a marketplace where accounts and cheats are sold

---

## Step 3: Utilities (Utilities Tab)

Additional tools for deeper investigation. Each utility is downloaded from its official website.

| Utility | Description | When to Use |
|---------|-------------|------------|
| **LastActivityView** | Shows computer activity log including program executions, file operations and more | When you need to reconstruct the full timeline of user actions |
| **USBDeview** | Lists all USB devices ever connected to the computer with dates and details | When you suspect cheats were run from a USB drive |
| **Everything** | Instant file search tool that indexes all files on all drives | When you need to find a specific file by name — search using cheat keywords |
| **System Informer** | Advanced system monitor and process viewer (formerly Process Hacker) | When you need to inspect running processes, DLLs, network connections in real time |
| **ShellBag Analyzer** | Analyzes Windows ShellBag entries that store folder access history | When you need to see which folders the user accessed, even if they were deleted |

---

## Step 4: Making a Decision

### If Suspicious Items Were Found

1. Document findings (export results / screenshots)
2. Cross-reference data from different sources (auto-scan + manual check + utilities)
3. Escalate to senior administrators if needed
4. Make a decision according to server rules

### If Nothing Was Found

- Auto-scan is clean **AND** manual check is clean **AND** utilities show nothing → **release the player**
- Do not hold a player without cause

---

## Important Notes

### Auto-Scan Keywords

The automatic scan searches for files and records matching these patterns:

**Substring match:**

`undead`, `melony`, `fecurity`, `ancient`, `medusa`, `mason`, `midnight`, `fatality`, `memesense`, `xnor`, `aimbot`, `wallhack`, `triggerbot`, `norecoil`, `speedhack`, `hwid_spoofer`, `unturned_cheat`, `unturnedcheat`, `unturnex`, `uloader`, `ucheats`, `utools`, `cheatengine`, `megadumper`, `extremedumper`, `neverlose`, `nixware`

**Exact match:**

`esp`, `hwid`, `spoofer`

### Virtual Machine Detection

The VM Scanner automatically detects if the system is running inside a virtual machine. If a user is running the system in a VM — this is a serious red flag, as VMs are used to hide cheat traces from the main system.

### Training

If you are a new administrator or moderator and haven't received training on player verification — **contact senior administrators**. They should provide training and explain all the nuances.

---

## Settings

| Setting | Description |
|---------|-------------|
| **Theme** | Choose the UI theme (Aurora, Monochrome, Tropical) |
| **Language** | Select the interface language |
| **Check for updates on startup** | Automatically check for updates on launch |
| **Auto-download updates** | Automatically download updates when available |
| **Delete program after use** | Automatically delete Custos when closed |
| **DELETE PROGRAM NOW** | Immediately delete the program |
