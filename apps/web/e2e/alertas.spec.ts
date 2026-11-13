import { expect, test } from '@playwright/test'

// Fase 8c: alertas de risco a partir do motor (demonstração tem aporte previsto).
test('alertas de risco da loteadora', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`alertas.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Alertas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Alertas')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Alertas')

  await page.getByRole('link', { name: 'Alertas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alertas de risco' })).toBeVisible()
  await expect(page.getByText('Nenhum alerta de risco hoje.')).toBeVisible()

  await page.getByRole('link', { name: 'Painel', exact: true }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  await page.goto('/alertas')
  const lista = page.getByRole('list', { name: 'Alertas' })
  // Plano da demonstração começa em jan/2026 e pede aporte até 2028.
  if (new Date().getFullYear() <= 2027) {
    await expect(lista).toContainText('Aporte próximo')
    await expect(lista).toContainText(
      /Aporte de R\$\s[\d.]+,\d{2} necessário a partir de \d{2}\/\d{4}/,
    )
    await expect(
      lista.getByRole('link', { name: 'Demonstração — Caso de referência' }).first(),
    ).toBeVisible()
  }
})
