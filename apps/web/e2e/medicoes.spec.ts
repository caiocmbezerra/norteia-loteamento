import { type Page, expect, test } from '@playwright/test'

const secao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

// Fase 3: medição por percentual acumulado gera a conta a pagar da diferença.
test('medições por percentual executado geram as contas do contrato', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Edu Engenharia')
  await page.getByLabel('E-mail').fill(`medicoes.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Medições')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')

  await page.goto('/configuracoes/fornecedores')
  await page.getByLabel('Nome').fill('Pavimentadora Rocha')
  await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click()
  await expect(page.getByText('Pavimentadora Rocha')).toBeVisible()
  await page.getByRole('link', { name: 'Painel', exact: true }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  await page.getByRole('link', { name: 'Custos e obra' }).click()

  const contrato = secao(page, 'Novo contrato')
  await contrato
    .getByLabel('Fornecedor', { exact: true })
    .selectOption({ label: 'Pavimentadora Rocha' })
  await contrato.getByLabel('Centro de custo', { exact: true }).selectOption({ index: 1 })
  await contrato.getByLabel('Descrição do contrato').fill('Pavimentação')
  await contrato.getByLabel('Valor (R$)').fill('500.000,00')
  await contrato.getByLabel('Início').fill('2026-01-01')
  await contrato.getByLabel('Término previsto').fill('2027-06-30')
  await contrato.getByRole('button', { name: 'Registrar contrato' }).click()
  await expect(contrato.getByText('Contrato registrado.')).toBeVisible()

  const contratos = secao(page, 'Contratos com fornecedores')
  const pav = contratos.getByRole('listitem').filter({ hasText: 'Pavimentação' })
  await expect(pav).toContainText('0,00% executado')
  const abrir = async () => {
    if ((await pav.locator('details').getAttribute('open')) === null)
      await pav.locator('summary').click()
  }
  await abrir()
  await pav.getByLabel('Executado acumulado (%)').fill('40')
  await pav.getByLabel('Vencimento').fill('2027-01-10')
  await pav.getByRole('button', { name: 'Registrar medição' }).click()
  await expect(pav.getByText(/40,00% executado · 1 medição/)).toBeVisible()
  await expect(
    secao(page, 'Contas a pagar em aberto').getByText('Medição 1 — 40,00% executado'),
  ).toBeVisible()

  // Percentual menor que o anterior é recusado; 100% fecha o contrato
  await abrir()
  await pav.getByLabel('Executado acumulado (%)').fill('30')
  await pav.getByLabel('Vencimento').fill('2027-02-10')
  await pav.getByRole('button', { name: 'Registrar medição' }).click()
  await expect(pav.getByText(/deve passar de 40,00%/)).toBeVisible()
  await pav.getByLabel('Executado acumulado (%)').fill('100')
  await pav.getByRole('button', { name: 'Registrar medição' }).click()
  await expect(pav.getByText(/100,00% executado · 2 medição/)).toBeVisible()
  const conta2 = secao(page, 'Contas a pagar em aberto')
    .getByRole('listitem')
    .filter({ hasText: 'Medição 2 — 100,00% executado' })
  await expect(conta2).toContainText('R$ 300.000,00')
})
