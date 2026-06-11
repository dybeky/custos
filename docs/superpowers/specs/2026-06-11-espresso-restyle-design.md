# Espresso Restyle + Russian Translation Polish — Design

**Date:** 2026-06-11
**Status:** Approved by user

## Goal

Restyle custos from the current dark-navy + pink/yellow pastel theme to a crisp,
clean, black-and-white look with smooth coffee-tone accents ("dark espresso").
Separately, perform a full grammar/accuracy pass over the Russian translations.

## Scope

### 1. Color system (token-level remap)

All color decisions live in `tailwind.config.js` and CSS variables in
`src/renderer/styles/index.css`. The restyle is primarily a token swap; pages
and components consume tokens.

New palette:

| Token | Old | New |
|---|---|---|
| bg | `#0d0f1f` (navy) | `#0E0C0A` (warm near-black) |
| panel / surface | `#16182c` / `#12131c` | `#171411` |
| panel-2 / elevated | `#1f2238` / `#1b1d2a` | `#1F1B16` |
| ink / text primary | `#ecedff` | `#EDE7DE` (warm off-white) |
| ink-dim / text secondary | `#9698c0` | `#A89F93` |
| primary accent (scan) | `#FF678B` (pink) | `#C8A47E` (caramel/latte) |
| accent hover | `#FF85A3` | `#D9BC9A` |
| secondary accent (scan-dim) | `#FFF48D` (yellow) | `#B0A696` (warm gray-beige) |
| success | `#34D399` | `#8FBF9F` (sage, desaturated) |
| error / alert | `#FF2D55` | `#D98E8E` (soft brick) |
| warning / amber | `#FFB84D` / `#ffc24b` | `#D9B380` (amber-caramel) |
| borders | yellow/pink alphas | warm gray/caramel alphas, subtle |

Principles:

- The UI reads black-and-white first; caramel is the single accent family.
- Status colors stay semantically distinct but desaturated to sit in the
  monochrome scheme.
- Glows toned way down: one subtle caramel glow for primary actions, no neon.
- Sweep all hardcoded hex values in `.tsx` files (~30 occurrences: `#FF678B`,
  `#FFF48D`, `#FFB3C6`, `#34D399`, `#FF2D55`, `#ffc24b`, `#FFB300`, `#00BFA5`)
  onto the new tokens.

### 2. Typography & crispness

- Body and display font switch from MuseoModerno to Inter. Verify Inter is
  bundled; if not, self-host woff2 like MuseoModerno (no network fetch at
  runtime — Electron app must work offline).
- Remove `text-transform: lowercase` on body and the uppercase `.font-display`
  treatment; normal sentence casing, slightly tight letter-spacing.
- Keep `font-variant-numeric: tabular-nums` for data, JetBrains Mono for mono.
- Remove the animated rainbow `theme-gradient-text`, aurora/blob animations,
  and pink glow effects. Replace with restrained fade/slide animations and the
  single caramel glow. Respect `prefers-reduced-motion` as today.

### 3. Russian translation pass

- Review every key in `src/renderer/i18n/ru.json` against `en.json` for:
  grammar, case agreement, natural phrasing, consistent terminology
  (scan / check / cheat software / detector vocabulary), correct «ё» usage,
  Russian typographic conventions.
- Also review `src/renderer/utils/feature-i18n.ts` and any user-facing strings
  in components (toasts, aria-labels) that are localized.
- en/ru key sets must remain identical; no key additions/removals unless a
  string is missing.

## Out of scope

- Layout/structural redesign of pages (already clean).
- Light theme / theme switcher (single dark-espresso theme only; the legacy
  `data-theme` variants all resolve to the one palette, as today).
- New features.

## Risks / notes

- `Settings` page mentions the pastel palette in copy (`settings.paletteDesc`);
  copy must be updated in both languages to describe the new look.
- Existing tests (vitest) must stay green.
- Legacy token names (`aurora`, `accent.lavender`, etc.) are kept but remapped
  so existing class usage doesn't break.
