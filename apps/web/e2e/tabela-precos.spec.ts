import { expect, test } from '@playwright/test'

// Fase 4b (RN-C05): tabela de preços com vigência e desconto acima do limite.
test('tabela reajustada vira o preço da venda e o desconto acima do limite fica registrado', async ({
  page,
}, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Tina Tabela')
  await page.getByLabel('E-mail').fill(`tabela.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Tabela')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Tabela')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Tabela')
  const empreendimento = page.url().split('?')[0]!

  // Limite de 5% de desconto sem aprovação
  await page.goto('/configuracoes/parametros')
  const limite = page
    .getByRole('region', { name: 'Comercial' })
    .locator('section, div')
    .filter({
      has: page.getByRole('heading', {
        name: 'Desconto máximo sobre a tabela sem aprovação de gestor',
      }),
    })
    .first()
  await limite.getByText('Definir valor').click()
  await limite.getByLabel('Valor (%)').fill('5')
  await limite.getByRole('button', { name: 'Salvar' }).click()
  await expect(limite.getByText('Parâmetro salvo.')).toBeVisible()

  // Tabela com 10% de reajuste e preço próprio para o lote 2
  await page.goto(`${empreendimento}/comercial`)
  await page.getByRole('link', { name: 'Tabela de preços' }).click()
  await expect(page.getByText(/Nenhuma tabela ainda/)).toBeVisible()
  await page.getByLabel('Nome da tabela').fill('Tabela de lançamento')
  await page.getByLabel('Reajuste (%)').fill('10')
  await page.getByLabel(/Quadra A · Lote 2/).fill('120.000,00')
  await page.getByRole('button', { name: 'Publicar tabela' }).click()
  await expect(page.getByText('Tabela publicada.')).toBeVisible()
  await expect(page.getByRole('cell', { name: /Tabela de lançamento \(vigente\)/ })).toBeVisible()

  // O lote passa a seguir a tabela
  await page.goto(empreendimento)
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await expect(page.getByText(/tabela R\$\s99\.000,00/)).toBeVisible()
  await page.getByText('Cadastro do lote').click()
  await expect(page.getByLabel('Preço de referência (R$)')).toBeDisabled()

  // Venda com 9,09% de desconto: acima do limite, a dona aprova ao vender
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-10-01')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Tabela')
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await expect(page.getByLabel('Preço (R$)')).toHaveValue('99.000,00')
  await page.getByLabel('Nome completo').fill('Joana Compradora')
  await page.getByLabel('Preço (R$)').fill('90.000,00')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await expect(page.getByText(/desconto de 9,09%/)).toBeVisible()
  await expect(page.getByText(/passa do limite de 5,00%/)).toContainText(
    'A venda fica registrada como aprovada por você.',
  )
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
})
