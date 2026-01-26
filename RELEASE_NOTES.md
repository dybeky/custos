# Custos v2.2.0

## What's New

This release focuses on **security hardening**, **bug fixes**, and **code quality improvements**.

---

## 🔒 Security

- Fixed **command injection** vulnerability in registry handler
- Fixed **batch script injection** in update/cleanup scripts
- Fixed **path validation bypass** vulnerability
- Updated all vulnerable dependencies (electron, vite, tar)
- **0 known vulnerabilities** in dependencies

## 🐛 Bug Fixes

- Fixed promise race condition in parallel scanner execution
- Fixed unhandled promise in download redirects
- Fixed resource leaks in file download cleanup
- Fixed language setting not persisting between restarts
- Fixed settings race condition during rapid changes

## ✨ New Features

- **Error Boundary** - Graceful error handling with recovery UI
- **Config Validation** - Runtime validation with Zod schemas
- **Safe VDF Parsing** - Result type pattern for better error handling
- **Memoized Store** - Pre-computed values for better performance

## ♿ Accessibility

- Added ARIA attributes to Modal, Toggle, and Button components
- Implemented focus trap and keyboard navigation in modals
- Screen reader support improvements

## 🧪 Testing & Quality

- Added **Vitest** test framework with **20 unit tests**
- Added **ESLint** configuration with TypeScript support
- Added **Prettier** for code formatting
- Added **GitHub Actions** CI/CD pipelines

## 📦 Updated Dependencies

| Package | Old | New |
|---------|-----|-----|
| electron | 28.1.0 | 35.0.0 |
| electron-builder | 24.9.1 | 26.5.0 |
| electron-vite | 2.0.0 | 3.1.0 |
| vite | 5.0.10 | 6.0.0 |

---

**Full Changelog**: [v2.1.0...v2.2.0](../../compare/v2.1.0...v2.2.0)
