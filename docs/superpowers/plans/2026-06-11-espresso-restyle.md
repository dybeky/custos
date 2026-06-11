# Espresso Restyle + Russian Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin custos to a crisp black-and-white theme with coffee (caramel/latte) accents and Inter typography, and polish all Russian translations.

**Architecture:** All colors flow through Tailwind tokens (`tailwind.config.js`) and CSS variables (`src/renderer/styles/index.css`); the restyle is a token swap plus a sweep of ~30 hardcoded hex values in 7 `.tsx` files. Typography switches from MuseoModerno (latin-only, forced lowercase) to self-hosted Inter (latin + cyrillic). Translations live in `src/renderer/i18n/ru.json` (444 lines, same key set as `en.json`).

**Tech Stack:** Electron + React + Tailwind, i18next, vitest.

**Verification commands:** `npm run typecheck && npm run lint && npm run test` (no UI unit tests exist; visual check via `npm run dev`).

**Note:** The working tree already has unrelated uncommitted changes. Only `git add` the specific files each task touches — never `git add -A`.

---

### Task 1: Bundle Inter font (latin + cyrillic), switch typography

**Files:**
- Create: `src/renderer/assets/fonts/Inter-latin.woff2`, `Inter-latin-ext.woff2`, `Inter-cyrillic.woff2`, `Inter-cyrillic-ext.woff2`
- Modify: `src/renderer/styles/index.css:1-16` (@font-face block), `tailwind.config.js:64-69` (fontFamily)
- Delete: `src/renderer/assets/fonts/MuseoModerno-latin-ext.woff2`, `MuseoModerno-latin.woff2`

- [ ] **Step 1: Download Inter variable woff2 subsets** from Google Fonts CSS2 API (UA must claim a modern Chrome to get woff2 + unicode-range output):

```bash
curl -s 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
```

Parse the returned CSS for the `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext` blocks; download each `src: url(...)` to the matching filename above. Record each block's `unicode-range` for Step 2.

- [ ] **Step 2: Replace the @font-face block** in `index.css` — four `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('../assets/fonts/Inter-<subset>.woff2') format('woff2'); unicode-range: <from Step 1>; }` rules replacing the two MuseoModerno rules.

- [ ] **Step 3: Update font stacks** in `tailwind.config.js`:

```js
fontFamily: {
  display: ['Inter', 'system-ui', 'sans-serif'],
  body: ['Inter', 'system-ui', 'sans-serif'],
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace']
},
```

- [ ] **Step 4: De-lowercase the body styles** in `index.css`: in the `body` rule, change `font-family` to `'Inter', system-ui, -apple-system, sans-serif`, remove `text-transform: lowercase;`, change `letter-spacing: .04em` to `-0.011em` (Inter's natural tracking). In `.font-display`, remove `text-transform: uppercase` and set `letter-spacing: -0.02em; font-weight: 600;`.

- [ ] **Step 5: Delete MuseoModerno woff2 files**, grep for any remaining `MuseoModerno` references (`grep -rn MuseoModerno src/`) and remove them.

- [ ] **Step 6: Verify** `npm run typecheck && npm run lint`, expect clean. Commit: `feat(ui): switch to self-hosted Inter with cyrillic support, drop lowercase styling`

---

### Task 2: Espresso token remap (tailwind.config.js + index.css)

**Files:**
- Modify: `tailwind.config.js:6-63` (colors), `:81-86` (boxShadow)
- Modify: `src/renderer/styles/index.css` (`:root` vars, theme vars, gradient-text, glass, badge keyframes)

- [ ] **Step 1: Replace the Tailwind color tokens:**

```js
colors: {
  // ── Espresso design-system tokens ──
  bg: '#0E0C0A',
  panel: '#171411',
  'panel-2': '#1F1B16',
  ink: '#EDE7DE',
  'ink-dim': '#A89F93',
  scan: '#C8A47E',
  'scan-dim': '#B0A696',
  alert: '#D98E8E',
  amber: '#D9B380',
  // ── Legacy tokens (kept so existing components don't break) ──
  background: { DEFAULT: '#0E0C0A', surface: '#171411', elevated: '#1F1B16' },
  accent: { lavender: '#D9BC9A', purple: '#B0A696', sky: '#B0A696', blue: '#C8A47E' },
  primary: { DEFAULT: '#C8A47E', hover: '#D9BC9A', muted: 'rgba(200, 164, 126, 0.12)' },
  aurora: { purple: '#B0A696', blue: '#C8A47E' },
  success: { DEFAULT: '#8FBF9F', muted: 'rgba(143, 191, 159, 0.12)' },
  error: { DEFAULT: '#D98E8E', muted: 'rgba(217, 142, 142, 0.12)' },
  warning: { DEFAULT: '#D9B380', muted: 'rgba(217, 179, 128, 0.12)' },
  text: {
    primary: 'rgba(237, 231, 222, 0.95)',
    secondary: 'rgba(237, 231, 222, 0.6)',
    muted: 'rgba(237, 231, 222, 0.4)'
  },
  border: { DEFAULT: 'rgba(237, 231, 222, 0.08)', hover: 'rgba(200, 164, 126, 0.25)' }
},
```

- [ ] **Step 2: Tone down shadows** in `boxShadow`: `glass` unchanged; `glow: '0 0 32px -10px rgba(200,164,126,0.25)'`; `glow-success: '0 0 20px rgba(143,191,159,0.2)'`; `glow-purple: '0 0 15px rgba(200,164,126,0.3)'`.

- [ ] **Step 3: Replace `:root` CSS vars** in `index.css`:

```css
:root {
  --bg:#0E0C0A; --panel:#171411; --panel-2:#1F1B16;
  --ink:#EDE7DE; --ink-dim:#A89F93; --scan:#C8A47E; --scan-dim:#B0A696;
  --alert:#D98E8E; --amber:#D9B380;
  --line:rgba(237,231,222,.08); --line-strong:rgba(200,164,126,.2);
  --glow:200,164,126;
}
```

And the legacy theme block: `--c-lavender:#D9BC9A; --c-purple:#B0A696; --c-sky:#B0A696; --c-blue:#C8A47E; --theme-primary:#C8A47E; --theme-primary-hover:#D9BC9A; --theme-primary-muted:rgba(200,164,126,0.12); --theme-accent-1:#B0A696; --theme-accent-2:#C8A47E; --theme-glow:rgba(200,164,126,0.25); --theme-bg:#0E0C0A; --theme-surface:#171411; --theme-elevated:#1F1B16; --theme-text-btn:#0E0C0A; --theme-border:rgba(237,231,222,0.08); --theme-border-hover:rgba(200,164,126,0.25);`

- [ ] **Step 4: De-neon the effects** in `index.css`:
  - `.theme-gradient-text`: replace animated rainbow with a static subtle caramel→cream gradient, **no animation**: `background: linear-gradient(90deg, #C8A47E, #EDE7DE); -webkit-background-clip: text; ...` (drop the `animation:` line; keep the class so callers don't break).
  - body background radial: lower glow alpha `.1` → `.06`.
  - `.glass`: `background: rgba(23, 20, 17, 0.55);`
  - `badgeBreathe` / `badgeSheen` rgba values → `rgba(200,164,126,…)` at half the old alphas (`.45`→`.22`).
  - Comment headers mentioning "pastels / navy" updated to describe the espresso palette.

- [ ] **Step 5: Verify** `npm run typecheck && npm run lint && npm run test`, expect clean/green. Commit: `feat(ui): espresso black/white/coffee design tokens`

---

### Task 3: Sweep hardcoded hex values in components

**Files (exact occurrences from grep):**
- `src/renderer/App.tsx:56` — gradient `#FF678B,#FFF48D,#FF678B` → `#C8A47E, #EDE7DE`
- `src/renderer/components/UpdateModal.tsx:8-13` — `New:'#C8A47E', Fixes:'#8FBF9F', Performance:'#B0A696', Improvements:'#B0A696'`, `ACCENT_DEFAULT='#C8A47E'`
- `src/renderer/pages/Dashboard.tsx:14-19` — same mapping as UpdateModal; `:102-104` SVG gradient stops → `#C8A47E / #D9BC9A / #C8A47E`; fix stale comments ("scan blue", "purple", "steel blue")
- `src/renderer/components/layout/Header.tsx:17-19` — `healthy:'#8FBF9F', warning:'#D9B380', error:'#D98E8E'`
- `src/renderer/pages/Manual.tsx:84,97,114,127,148,161` — accents → cycle `#C8A47E` / `#B0A696` / `#D9BC9A` (keep variety but monochrome-coffee)
- `src/renderer/pages/Settings.tsx:7-10` — swatches → `{hex:'#EDE7DE',name:'Cream'},{hex:'#C8A47E',name:'Caramel'},{hex:'#B0A696',name:'Taupe'},{hex:'#2B2118',name:'Espresso'}` (names are display-only; check whether they're localized — if shown raw, move to i18n or keep as proper nouns)
- `src/renderer/components/layout/AnimatedBackground.tsx:10-11` — rewrite (Step 2)

- [ ] **Step 1: Apply the mechanical replacements above.** Then `grep -rn '#FF678B\|#FFF48D\|#FFB3C6\|#34D399\|#FF2D55\|#ffc24b\|#FFB300\|#00BFA5' src/renderer` — expect zero hits.

- [ ] **Step 2: Rewrite `AnimatedBackground.tsx`** for the crisp look — replace pink/yellow orbs with two extremely subtle warm glows (espresso steam, not lava lamp):

```tsx
/**
 * Full-viewport backdrop: two faint warm glows drifting behind the app so the
 * near-black base feels warm rather than flat. Fixed + pointer-events-none;
 * motion disabled under prefers-reduced-motion (see .animate-blob-* in index.css).
 */
const CARAMEL = '#C8A47E'
const CREAM = '#EDE7DE'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="absolute -top-32 -left-24 w-[42rem] h-[42rem] rounded-full blur-3xl opacity-[0.07] animate-blob-1"
        style={{ background: `radial-gradient(circle, ${CARAMEL}, transparent 70%)` }}
      />
      <div
        className="absolute -bottom-40 -right-24 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-[0.05] animate-blob-2"
        style={{ background: `radial-gradient(circle, ${CREAM}, transparent 70%)` }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Visual sanity check** with `npm run dev` (Electron may not fully run on macOS for this Windows-targeted app — at minimum confirm the renderer builds: `npm run build`).

- [ ] **Step 4: Verify** `npm run typecheck && npm run lint && npm run test`. Commit: `feat(ui): sweep hardcoded pastel colors onto espresso tokens`

---

### Task 4: Update appearance copy (en + ru)

**Files:**
- Modify: `src/renderer/i18n/en.json` (`settings.paletteDesc`), `src/renderer/i18n/ru.json` (same key)
- Check: `src/renderer/pages/Settings.tsx` for any other palette-referencing copy

- [ ] **Step 1:** en: `"paletteDesc": "Custos uses a single black-and-white palette with warm coffee accents across the interface."` ru: `"paletteDesc": "Custos использует единую чёрно-белую палитру с тёплыми кофейными акцентами во всём интерфейсе."`
- [ ] **Step 2:** Commit with Task 5 (same files).

---

### Task 5: Russian translation polish

**Files:**
- Modify: `src/renderer/i18n/ru.json` (all 444 lines reviewed)
- Read-only reference: `src/renderer/i18n/en.json`
- Check: components for localized aria/toast strings already wired through i18n

- [ ] **Step 1: Read `en.json` and `ru.json` in full, side by side.** For every key verify: (a) meaning matches English; (b) grammar — case agreement, verb aspect, plural forms with `{{count}}`; (c) consistent terminology: scan = «сканирование», check = «проверка», cheat = «чит», scanner = «сканер», detector = «детектор», folder = «папка», registry = «реестр»; (d) consistent «ё» usage (use «ё» everywhere, the file already does); (e) natural UI phrasing — imperatives for buttons, no calques from English; (f) interpolation placeholders (`{{arch}}`, `{{os}}`, etc.) preserved exactly.
- [ ] **Step 2: Verify key parity:** `node -e "const a=Object.keys(require('./src/renderer/i18n/en.json')),b=Object.keys(require('./src/renderer/i18n/ru.json'));console.log(JSON.stringify(a)===JSON.stringify(b)?'OK':'MISMATCH')"` plus a deep-key diff. Expect OK.
- [ ] **Step 3: Validate JSON** (`node -e "require('./src/renderer/i18n/ru.json')"`) and run `npm run test`.
- [ ] **Step 4: Commit:** `fix(i18n): grammar and terminology pass over Russian translations; update appearance copy`

---

### Task 6: Final verification

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm run test` — all green.
- [ ] **Step 2:** `npm run build` — renderer + main build clean.
- [ ] **Step 3:** Grep regression checks: no `MuseoModerno`, no old pastel hexes, no `text-transform: lowercase` in `src/`.
- [ ] **Step 4:** Final commit if any stragglers; summarize changes.
