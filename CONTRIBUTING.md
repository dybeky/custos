# Contributing to Custos

## Branch model

- All development work happens on the `dev` branch.
- Open a pull request from `dev` into `main` when a feature or fix is ready for release.
- Do not commit directly to `main`.

## How to run

```bash
npm install
npm run dev
```

This starts the Electron app in development mode with hot-reload via electron-vite.

### Native code (live scan)

The live-memory scanner calls Win32 directly through `koffi`, which ships
prebuilt binaries for win32 x64 and arm64 — there is nothing to compile and no
Visual Studio toolchain to install. (It used to depend on `memoryjs`, a
compiled addon whose build silently failed and dropped Live Scan from release
builds.) On macOS/Linux the live scanner reports "native unavailable" and the
Windows-only tests are skipped.

If you run the app from a terminal inside VS Code and it dies with
`Cannot read properties of undefined (reading 'isPackaged')`, the editor has
set `ELECTRON_RUN_AS_NODE` — unset it before `npm run dev`.

## How to verify

Before opening a pull request, confirm the same gates CI runs pass:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

`npm run lint` runs with `--max-warnings 0`: a new warning fails CI, so fix it
(or, where it is genuinely intended, disable the rule for that line with a
comment explaining why) rather than letting warnings pile up.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

types: feat, fix, docs, refactor, test, chore, ci, perf, style
```

Examples:
- `feat: add BAM scanner`
- `fix: handle missing prefetch directory`
- `docs: update README install section`

Keep the subject line under 72 characters. Use the body for context when the change is non-obvious.

## AI co-author trailers

Do not add AI co-author trailers to commits.
