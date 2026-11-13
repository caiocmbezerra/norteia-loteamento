import { expect, test } from '@playwright/test'

// Fase 8b: sem chave da API configurada, o assistente avisa e não chama nada.
test('assistente sem chave avisa que não está ativo', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page
    .getByLabel('E-mail')
    .fill(`assistente.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Assistente')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Assistente')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Assistente')

  await page.getByRole('link', { name: 'Assistente', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Assistente' })).toBeVisible()
  await expect(
    page.getByText('O assistente ainda não foi ativado nesta instalação.').first(),
  ).toBeVisible()
  await page.getByLabel('Sua pergunta').fill('Quanto tenho a receber?')
  await page.getByRole('button', { name: 'Perguntar' }).click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'O assistente ainda não foi ativado nesta instalação.' }),
  ).toBeVisible()
})
