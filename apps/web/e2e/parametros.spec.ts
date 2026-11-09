import { expect, test } from '@playwright/test'

// Parâmetros por cliente: cada loteadora confirma com o seu advogado/contador.
test('dona define a multa da loteadora no lugar da sugestão', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Pat Parâmetros')
  await page.getByLabel('E-mail').fill(`param.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Parâmetros')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Parâmetros')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Parâmetros')

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: /Parâmetros/ }).click()
  await expect(page.getByText(/ainda usam a sugestão da plataforma/)).toBeVisible()
  const multa = page
    .getByRole('region', { name: 'Carteira e cobrança' })
    .locator('section, div')
    .filter({
      has: page.getByRole('heading', { name: 'Multa única sobre a parcela paga em atraso' }),
    })
    .first()
  await expect(multa.getByText('sugestão não confirmada')).toBeVisible()
  await multa.getByText('Definir valor').click()
  await multa.getByLabel('Valor (%)').fill('2')
  await multa.getByRole('button', { name: 'Salvar' }).click()
  await expect(multa.getByText('Parâmetro salvo.')).toBeVisible()
  await expect(multa.getByText(/definido pela loteadora desde/)).toBeVisible()
  await expect(multa.getByText('sugestão não confirmada')).toHaveCount(0)

  // Reforma tributária: simulação com as alíquotas de teste de 2026 (sem alíquota depois).
  const reforma = page.getByRole('region', { name: 'Simulação da reforma tributária' })
  if (new Date().getFullYear() === 2026)
    await expect(reforma).toContainText(/total R\$\s350,00 \(0,35% da\s+venda\)/)
  else await expect(reforma).toContainText('Sem alíquotas de IBS/CBS em vigor')
})
