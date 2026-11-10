import { expect, test } from '@playwright/test'

// L3: matrícula aberta pelo cartório fica guardada no cadastro do lote.
test('matrícula do lote no cadastro e contagem no empreendimento', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Marta Matrícula')
  await page
    .getByLabel('E-mail')
    .fill(`matricula.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Matrículas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Matrículas')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Matrículas')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(/0 de 2 matrículas/)).toBeVisible()

  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByText('Cadastro do lote').click()
  await page.getByLabel('Matrícula no cartório').fill('45.678')
  await page.getByLabel('Aberta em').fill('2026-03-15')
  await page.getByRole('button', { name: 'Salvar lote' }).click()
  await expect(page.getByText(/1 de 2 matrículas/)).toBeVisible()
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await expect(page.getByText(/matrícula 45\.678 \(aberta em 15\/03\/2026\)/)).toBeVisible()
})
