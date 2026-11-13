import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// L2: lote com contrato quitado aparece como "Quitado" no mapa, nos filtros e na página do lote.
test('lote vendido à vista e pago aparece como quitado no mapa', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Quim Quitado')
  await page.getByLabel('E-mail').fill(`quitado.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Quitação')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Quitação')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Quitação')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Quitação')

  // Venda à vista e recebimento
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda direta' }).click()
  await page.getByLabel('Nome completo').fill('Quitéria Compradora')
  await page.getByLabel('Entrada (R$)').fill('90.000,00')
  await page.getByLabel('Parcelas').fill('0')
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
  await expect(page.locator('span', { hasText: /^Vendido$/ })).toBeVisible()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // Mapa: quitado no lugar de vendido
  await page.goto(empreendimento)
  await expect(page.getByRole('link', { name: /Quadra A, lote 1: Quitado/ })).toBeVisible()
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    axe.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([])
  await page.getByRole('link', { name: 'Quitado (1)' }).click()
  await expect(page.getByRole('link', { name: /Quadra A, lote 2:/ })).toHaveCount(0)
  await page.getByRole('link', { name: /Quadra A, lote 1: Quitado/ }).click()
  await expect(page.locator('span', { hasText: /^Quitado$/ })).toBeVisible()
})
