import { expect, test } from '@playwright/test'

// Fase 6c: sócios da SPE, participações com vigência, aportes e distribuições.
test('sócios, participações e movimentos da SPE', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Sol Sócia')
  await page.getByLabel('E-mail').fill(`socios.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Sócios')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Sócios')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Sócios')

  await page.goto('/configuracoes/empresas')
  await page.locator('a[href^="/spes/"]').first().click()
  await expect(page.getByText(/Empreendimentos sem plano aprovado ficam fora/)).toBeVisible()

  for (const nome of ['Ana Investidora', 'Beto Investidor']) {
    await page.locator('summary', { hasText: 'Cadastrar sócio' }).click()
    await page.getByLabel('Nome do sócio').fill(nome)
    await page.getByRole('button', { name: 'Cadastrar sócio' }).click()
    await expect(page.getByText('Sócio cadastrado.')).toBeVisible()
    await page.reload()
  }

  await page.locator('summary', { hasText: 'Definir participação' }).click()
  await page.locator('#par-socio').selectOption({ label: 'Ana Investidora' })
  await page.getByLabel('Participação (%)').fill('60')
  await page.getByRole('button', { name: 'Registrar participação' }).click()
  await expect(page.getByText(/Participação registrada/)).toBeVisible()
  await page.locator('#par-socio').selectOption({ label: 'Beto Investidor' })
  await page.getByLabel('Participação (%)').fill('50')
  await page.getByRole('button', { name: 'Registrar participação' }).click()
  await expect(page.getByText('As participações da SPE passariam de 100%.')).toBeVisible()
  await page.getByLabel('Participação (%)').fill('40')
  await page.getByRole('button', { name: 'Registrar participação' }).click()
  await expect(page.getByText(/Participação registrada/)).toBeVisible()

  await page.locator('summary', { hasText: 'Registrar aporte' }).click()
  await page.locator('#mov-socio').selectOption({ label: 'Ana Investidora' })
  await page.getByLabel('Valor (R$)').fill('600.000,00')
  await page.getByRole('button', { name: 'Registrar movimento' }).click()
  await expect(page.getByText('Movimento registrado.')).toBeVisible()

  const ana = page.getByRole('row', { name: /Ana Investidora/ })
  await expect(ana).toContainText('60,00%')
  await expect(ana).toContainText(/R\$\s600\.000,00/)
  await expect(page.getByRole('row', { name: /Beto Investidor/ })).toContainText('40,00%')
})
