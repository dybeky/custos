// @ts-check
const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = tseslint.config(
  // Ignore build output, config files, etc.
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
    ],
  },

  // Base config for all TypeScript/TSX source files
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      'no-console': 'warn',
      // New in ESLint 9's recommended set; demote to warning for parity with ESLint 8 behaviour
      'no-useless-assignment': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // Tests stub Electron, IPC and store internals; loose typing there is
  // deliberate and keeps fakes short.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // The logger is the one place allowed to write to the console.
  {
    files: ['src/main/services/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // React Hooks rules for renderer only
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // The renderer has no file logger; surfacing failures in DevTools is intended.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  }
)
