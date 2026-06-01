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
