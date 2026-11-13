import { expect, test } from '@playwright/test'

// Fase 4b: proposta como etapa separada — propor, aceitar e vender com as mesmas condições.
test('proposta aceita vira a venda com as condições negociadas', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Paula Proposta')
  await page.getByLabel('E-mail').fill(`proposta.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Propostas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Propostas')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Propostas')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-10-01')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Propostas')

  // Proposta
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Fazer proposta' }).click()
  await expect(page.getByLabel('Preço (R$)')).toHaveValue('90.000,00')
  await page.getByLabel('Nome completo').fill('Joana Compradora')
  await page.getByLabel('CPF (opcional)').fill('529.982.247-25')
  await page.getByLabel('Preço (R$)').fill('88.000,00')
  await page.getByLabel('Entrada (R$)').fill('8.800,00')
  await page.getByLabel('Parcelas').fill('100')
  await expect(page.getByText(/100 × R\$/)).toBeVisible()
  await page.getByLabel('Observação para a gestão').fill('Cliente quer fechar ainda este mês.')
  await page.getByRole('button', { name: 'Enviar proposta' }).click()
  await expect(page.getByText('Proposta enviada.', { exact: false })).toBeVisible()
  await expect(
    page.getByText(/Proposta de Joana Compradora: R\$\s88\.000,00 em 100 parcelas/),
  ).toBeVisible()

  // A gestão aceita na tela comercial
  await page.goto(`${empreendimento}/comercial`)
  const lista = page.getByRole('heading', { name: 'Propostas' }).locator('..')
  await expect(lista).toContainText('Cliente quer fechar ainda este mês.')
  await lista.getByRole('button', { name: 'Aceitar' }).click()
  await page.getByRole('link', { name: 'Registrar venda da proposta' }).click()

  // A venda abre com as condições da proposta
  await expect(page.getByText(/Condições da proposta aceita de Joana Compradora/)).toBeVisible()
  await expect(page.getByLabel('Nome completo')).toHaveValue('Joana Compradora')
  await expect(page.getByLabel('Preço (R$)')).toHaveValue('88.000,00')
  await expect(page.getByLabel('Parcelas')).toHaveValue('100')
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()

  // A proposta sai da lista (convertida)
  await page.goto(`${empreendimento}/comercial`)
  await expect(page.getByRole('heading', { name: 'Propostas' })).toHaveCount(0)
})
