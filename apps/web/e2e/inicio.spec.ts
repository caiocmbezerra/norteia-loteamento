import { expect, test } from '@playwright/test'

test('página inicial carrega em português e sem rolagem horizontal', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('NorteIA Loteamento')
  await expect(page.getByRole('link', { name: 'Criar conta' })).toBeVisible()

  const larguraExcedente = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(larguraExcedente).toBeLessThanOrEqual(0)
})

test('rota interna sem login vai para a tela de entrar', async ({ page }) => {
  await page.goto('/painel')
  await expect(page).toHaveURL(/\/entrar\?proximo=%2Fpainel/)
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
})
