import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
