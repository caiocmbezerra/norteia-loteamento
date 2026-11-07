import { expect, test } from '@playwright/test'

test('página inicial carrega em português e sem rolagem horizontal', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('NorteIA Loteamento')
  await expect(page.getByText('Fase 0')).toBeVisible()

  const larguraExcedente = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(larguraExcedente).toBeLessThanOrEqual(0)
})
