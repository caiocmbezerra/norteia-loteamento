import { expect, test } from '@playwright/test'

// Fase 4b: leads no funil e meta do mês com o realizado vindo das vendas.
test('leads no funil e meta do mês acompanhando as vendas', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Mel Metas')
  await page.getByLabel('E-mail').fill(`metas.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Metas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Metas')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Metas')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-10-01')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Metas')

  // Leads
  await page.goto(`${empreendimento}/comercial`)
  await page.getByRole('link', { name: 'Leads', exact: true }).click()
  await page.getByLabel('Nome do interessado').fill('Marcos Interessado')
  await page.getByLabel('Origem').selectOption('placa')
  await page.getByRole('button', { name: 'Cadastrar lead' }).click()
  await expect(page.getByText('Lead cadastrado.')).toBeVisible()
  const emAberto = page.getByRole('heading', { name: 'Em aberto' }).locator('..')
  await expect(emAberto).toContainText('Marcos Interessado · Placa no local')
  await emAberto.getByLabel('Etapa (Marcos Interessado)').selectOption('perdido')
  await emAberto.getByRole('button', { name: 'Salvar' }).click()
  await expect(emAberto.getByRole('alert')).toContainText('Informe o motivo da perda.')
  await emAberto.getByLabel('Motivo da perda').fill('Comprou em outro loteamento')
  await emAberto.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { name: 'Encerrados' }).locator('..')).toContainText(
    'Perdido — Comprou em outro loteamento',
  )

  // Meta do mês: 2 vendas
  await page.goto(`${empreendimento}/comercial`)
  await page.getByText('Definir meta').click()
  await page.getByLabel('Vendas (lotes)').fill('2')
  await page.getByLabel('VGV (R$)').fill('180.000,00')
  await page.getByRole('button', { name: 'Salvar meta' }).click()
  await expect(page.getByText(/0 de 2 vendas · R\$\s0,00 de R\$\s180\.000,00/)).toBeVisible()

  // Uma venda no mês entra no realizado
  await page.goto(empreendimento)
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda direta' }).click()
  await page.getByLabel('Nome completo').fill('Joana Compradora')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
  await page.goto(`${empreendimento}/comercial`)
  await expect(page.getByText(/1 de 2 vendas · R\$\s90\.000,00 de R\$\s180\.000,00/)).toBeVisible()
  await expect(
    page.getByRole('progressbar', { name: 'Meta de vendas de Empreendimento' }),
  ).toHaveAttribute('aria-valuenow', '50')
})
