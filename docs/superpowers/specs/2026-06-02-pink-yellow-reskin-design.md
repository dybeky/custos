# Pink + Yellow Re-skin — Design

**Date:** 2026-06-02
**Status:** Approved

## Goal

Re-skin the Custos UI to a warm two-color brand palette:

- **Brand pink `#FF678B`** — primary interactive color (buttons, active states, links, the "scan" color, focus rings, glows)
- **Brand yellow `#FFF48D`** — secondary accent (gradient partner, heading sweeps, small highlights)

The current scheme is a cool blue/lavender/purple/sky pastel family on a deep-navy base. This design replaces the **brand/accent** family only.

## Decisions

1. **Semantic status colors are preserved** so scan results stay instantly readable:
   - success/clean green `#34D399` — unchanged
   - warning amber `#ffc24b` — unchanged (distinct enough from the pale brand yellow)
   - Header health: healthy `#00BFA5`, warning `#FFB300` — unchanged
2. **Threat/error shifts to a deeper true red `#FF2D55`** (from `#ff6b83`). Reason: the old threat-red is nearly identical to brand pink `#FF678B`; a clearer red keeps "findings detected" reading as danger and prevents it blending into normal pink UI. All error/alert reds (`#ff6b83`, `#FF5C73`, Header error `#FF5252`) collapse to `#FF2D55`.
3. **Dark navy background is kept** (`#0d0f1f` / `#0a0b12`) — pink and yellow pop hardest against it.
4. **Old purple/sky accents map to yellow; lavender maps to light-pink.** Button text stays dark (`#0a0b12`) for contrast on light pink/yellow surfaces.
5. **Gradients** (heading text, animated borders, sheen) become a **pink → yellow** sweep.

## Canonical color map (old → new)

Apply uniformly everywhere, case-insensitive, preserving each rgba's existing alpha value.

| Old | New | Role |
|---|---|---|
| `#80A8FF` (blue) | `#FF678B` | primary / scan |
| `#9cbcff` (blue hover) | `#FF85A3` | primary hover |
| `#8EC1DE` (sky) | `#FFF48D` | accent / scan-dim |
| `#CEB5FF` (purple) | `#FFF48D` | accent |
| `#D3D3FF` (lavender) | `#FFB3C6` | light-pink accent |
| `#ff6b83` / `#FF5C73` / `#FF5252` | `#FF2D55` | threat / error |
| `rgba(128,168,255,a)` | `rgba(255,103,139,a)` | pink glow (keep alpha) |
| `rgba(206,181,255,a)` | `rgba(255,244,141,a)` | yellow glow (keep alpha) |
| `rgba(211,211,255,a)` | `rgba(255,103,139,a)` | warmed border lines (keep alpha) |
| `rgba(255,92,115,a)` (error muted) | `rgba(255,45,85,a)` | threat muted (keep alpha) |
| glow rgb var `128,168,255` | `255,103,139` | `--glow` |

**Unchanged:** `#34D399`, `#ffc24b`, `#00BFA5`, `#FFB300`, all backgrounds (`#0d0f1f`, `#0a0b12`, `#16182c`, `#1f2238`, `#12131c`, `#1b1d2a`), and ink colors (`#ecedff`, `#9698c0`).

**Gradient stops:** any blue/lavender/purple/sky multi-stop gradient (e.g. `.theme-gradient-text`, `badge-sheen`) becomes a `#FF678B → #FFF48D → #FF678B` sweep.

## Files touched

1. **`tailwind.config.js`** — `colors` tokens (`scan`, `scan-dim`, `alert`, `accent.*`, `primary.*`, `aurora.*`, `error.*`, `border.*`) and the `boxShadow` glow rgba values (`glow`, `glow-purple`). Keep `success`, `warning`, `glow-success`, bg/ink tokens.
2. **`src/renderer/styles/index.css`** — `:root` design tokens (`--scan`, `--scan-dim`, `--alert`, `--line`, `--line-strong`, `--glow`), legacy `--c-*` and `--theme-*` vars, `.theme-gradient-text` stops, and the `badgeBreathe` / `badge-sheen` rgba colors.
3. **`src/renderer/pages/Dashboard.tsx`** — 15 inline blue/purple hex + rgba glows.
4. **`src/renderer/pages/Manual.tsx`** — 6 inline accent hex.
5. **`src/renderer/pages/Settings.tsx`** — 4 inline accent hex.
6. **`src/renderer/components/UpdateModal.tsx`** — 4 inline accent hex.
7. **`src/renderer/components/layout/Header.tsx`** — health `error` `#FF5252` → `#FF2D55` (keep `healthy`/`warning`).
8. **`src/renderer/App.tsx`** — 1 inline accent hex.

## Verification

- `npm run typecheck` and `npm run lint` pass.
- No remaining `#80a8ff` / `#9cbcff` / `#8ec1de` / `#ceb5ff` / `#d3d3ff` / `#ff6b83` / `#ff5c73` / `#ff5252` / `rgba(128,168,255` / `rgba(206,181,255` / `rgba(211,211,255` occurrences under `src/renderer` or `tailwind.config.js` (grep returns empty).
- Status semantics intact: green clean, amber warning, red `#FF2D55` threat.
