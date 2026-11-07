import { defineConfig } from 'vitest/config'

// RN-F17 / roadmap Fase 2: o motor exige 100% de cobertura.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
