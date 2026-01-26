# Changelog

All notable changes to Custos will be documented in this file.

## [2.2.0] - 2025-01-27

### Security Fixes

- **Fixed command injection vulnerability in registry handler** - Replaced `exec()` with `execFile()` and added strict input validation for registry key paths
- **Fixed batch script injection** - Added comprehensive escaping for batch special characters (`^`, `&`, `|`, `<`, `>`, `"`, `%`) in update and cleanup scripts
- **Fixed path validation vulnerability** - Now validates paths AFTER expanding environment variables to prevent bypass attacks
- **Updated vulnerable dependencies:**
  - `electron`: 28.1.0 → 35.0.0 (ASAR Integrity Bypass fix)
  - `electron-builder`: 24.9.1 → 26.5.0 (tar vulnerability fix)
  - `electron-vite`: 2.0.0 → 3.1.0
  - `vite`: 5.0.10 → 6.0.0
  - Added `tar` override to 7.5.6 for path sanitization fix

### Bug Fixes

- **Fixed promise race condition** - Replaced buggy promise settlement detection in scanner group execution with proper index-based tracking
- **Fixed unhandled promise in download** - Recursive redirect calls now properly propagate resolve/reject, added `response.resume()` for memory cleanup
- **Fixed resource cleanup in download** - Replaced mixed sync/async cleanup with consistent async cleanup using `fs/promises`
- **Fixed settings language persistence** - Language setting now properly saves and loads between app restarts
- **Fixed settings race condition** - Added 100ms debounce to prevent lost changes during rapid toggles

### New Features

- **Error Boundary** - Added React Error Boundary component to gracefully handle runtime errors with user-friendly fallback UI and automatic focus restoration
- **Memoized scan store** - Added pre-computed values (`_totalFindings`, `_hasFindings`, `_successfulScans`, `_failedScans`) for better performance
- **New scan selectors** - Added `useScanStats()`, `useScanProgress()`, `useResultsWithFindings()` with shallow comparison
- **VDF Parser Result type** - Added safe parsing methods `parseSteamAccountsSafe()` and `parseGenericVdfSafe()` with proper error handling
- **Config validation** - Added Zod schemas for runtime validation of all configuration files

### Accessibility Improvements

- **Modal component:**
  - Added `role="dialog"` and `aria-modal="true"`
  - Implemented focus trap for keyboard navigation
  - Added `aria-labelledby` for title association
  - Focus restoration on close

- **Toggle component:**
  - Added `aria-label` support for unlabeled toggles
  - Added `aria-labelledby` and `aria-describedby` associations

- **Button component:**
  - Added `aria-busy` state during loading
  - Added `aria-disabled` attribute
  - Added screen reader text for loading state

### Performance Improvements

- **Keyword matcher O(1) lookup** - `findKeyword()` now uses `patternIndexMap` for constant-time pattern lookup instead of O(n) linear search
- **Scan store memoization** - Computed values are now cached and only recalculated when results change

### Code Quality

- **Added ESLint configuration** - Created `.eslintrc.json` with TypeScript and React hooks support
- **Added Prettier configuration** - Created `.prettierrc.json` for consistent code formatting
- **Added EditorConfig** - Created `.editorconfig` for consistent editor settings
- **Added Vitest** - Test framework with 20 unit tests for critical modules:
  - `keyword-matcher.test.ts` - 11 tests
  - `vdf-parser.test.ts` - 9 tests
- **Fixed all ESLint errors** - Resolved unused imports, variables, and other linting issues
- **Type safety improvements** - Added `APP_OPEN_REGISTRY` to `IPC_CHANNELS` constant, removed hardcoded strings

### Infrastructure

- **GitHub Actions CI/CD:**
  - `ci.yml` - Runs lint, typecheck, tests on push/PR
  - `release.yml` - Automatic release creation on version tags
- **New npm scripts:**
  - `npm run test` - Run Vitest tests
  - `npm run test:watch` - Run tests in watch mode

### Dependencies Added

- `vitest` ^3.0.0 - Testing framework
- `zod` ^3.24.0 - Runtime type validation
- `@typescript-eslint/eslint-plugin` ^6.21.0
- `@typescript-eslint/parser` ^6.21.0
- `eslint-plugin-react-hooks` ^4.6.0
- `prettier` ^3.2.0

---

## [2.1.0] - Previous Release

- Initial scanner implementations
- Basic UI components
- Core scanning functionality
