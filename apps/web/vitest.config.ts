import { defineConfig } from 'vitest/config'

// Testes unitários do app; os de ponta a ponta (e2e/) rodam no Playwright.
export default defineConfig({
  test: {
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    passWithNoTests: true,
  },
})
