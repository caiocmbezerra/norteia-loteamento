import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// No ambiente de nuvem do Claude Code o Chromium já vem instalado neste caminho;
// no CI o navegador é instalado pelo próprio Playwright.
const chromiumLocal = '/opt/pw-browsers/chromium'
const executablePath = !process.env.CI && existsSync(chromiumLocal) ? chromiumLocal : undefined

const PORTA = 3100

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'celular',
      use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : {} },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORTA}`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
