import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Renderer component tests are .tsx; main-process tests are .ts. Both are
    // discovered here. The global env stays 'node' (the main-process tests need
    // it); .tsx component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` pragma, leaving node tests untouched.
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.test.tsx', 'src/**/*.spec.tsx'],
    exclude: ['node_modules', 'out', 'release'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/**'],
      exclude: ['node_modules', 'out', 'release', '**/*.test.ts', '**/*.spec.ts'],
      thresholds: {
        statements: 14,
        branches: 13,
        functions: 14,
        lines: 15
      }
    }
  }
})
