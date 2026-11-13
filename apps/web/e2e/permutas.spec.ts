import { expect, test } from '@playwright/test'

// Fase 6b: permuta física (lotes saem do estoque) e financeira (extrato e repasse).
test('permuta física e financeira com extrato do permutante', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Pri Permuta')
  await page.getByLabel('E-mail').fill(`permuta.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Permuta')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Permuta')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Permuta')
  const empreendimento = page.url().split('?')[0]!

  // Permuta física com o lote 2
  await page.getByRole('link', { name: 'Permutas' }).click()
  await page.getByText('Nova permuta física (lotes)').click()
  await page.locator('#fis-nome').fill('Pedro Dono do Terreno')
  await page.getByLabel('Quadra A · Lote 2').check()
  await page.locator('#fis-valor').fill('90.000,00')
  await page.getByRole('button', { name: 'Registrar permuta física' }).click()
  await expect(page.getByText('Permuta física registrada')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumo das permutas' })).toContainText(
    /Lotes em permuta física\s*1/,
  )

  // Permuta financeira de 10% sobre o recebido
  await page.getByText('Nova permuta financeira (percentual)').click()
  await page.locator('#fin-nome').fill('Pedro Dono do Terreno')
  await page.getByLabel('Percentual (%)').fill('10')
  await page.getByRole('button', { name: 'Registrar permuta financeira' }).click()
  await expect(page.getByText('Permuta financeira registrada.')).toBeVisible()

  // Venda do lote 1 com entrada paga → repasse devido de 900,00
  await page.goto(empreendimento + '/editar')
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('link', { name: /Quadra A, lote 2: permuta/i })).toBeVisible()
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Carla Compradora')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  await page.goto(`${empreendimento}/permutas`)
  const extrato = page.getByRole('region', { name: 'Extrato de Pedro Dono do Terreno' })
  await expect(extrato).toContainText(/Devido\s*R\$\s900,00/)
  await page.getByLabel('Valor repassado (R$)').fill('500,00')
  await page.getByRole('button', { name: 'Registrar repasse' }).click()
  await expect(page.getByText('Repasse registrado.')).toBeVisible()
  await expect(extrato).toContainText(/Saldo\s*R\$\s400,00/)
})
