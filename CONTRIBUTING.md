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

### Windows: rebuilding the native live-scan module

The live-memory scanner uses `memoryjs`, a native Node addon (Windows only).
After `npm ci` (or `npm install`), rebuild it against Electron's ABI before
starting the app or running tests that exercise the live scanner:

```bash
npm run rebuild
```

This runs `electron-rebuild -f -w memoryjs`. On non-Windows hosts, or if the
build toolchain is not present, the command will fail — that is expected. The
live-scan feature degrades gracefully to "native unavailable" and all other
scanners continue to work normally.

## How to verify

Before opening a pull request, confirm all three gates pass:

```bash
npm run typecheck && npm run lint && npm run test
```

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
