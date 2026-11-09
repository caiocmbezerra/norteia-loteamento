import { type Page, expect, test } from '@playwright/test'

const secao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

const pdf = (texto: string) => ({
  name: `${texto}.pdf`,
  mimeType: 'application/pdf',
  buffer: Buffer.from(`%PDF-1.4\n% ${texto}\n%%EOF\n`, 'latin1'),
})

// Fase 3: nota fiscal anexada à conta a pagar, no lançamento ou depois.
test('nota anexada à conta a pagar abre pelo link do anexo', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Nina Notas')
  await page.getByLabel('E-mail').fill(`anexos.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Notas')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')
  await page.getByRole('link', { name: 'Painel', exact: true }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  await page.getByRole('link', { name: 'Custos e obra' }).click()

  // Conta avulsa com a nota escolhida no lançamento
  const conta = secao(page, 'Nova conta a pagar')
  await conta
    .getByLabel('Ler nota, boleto ou recibo (opcional)')
    .setInputFiles(pdf('nota-topografia'))
  await conta.getByLabel('Centro de custo (avulsa)').selectOption({ index: 1 })
  await conta.getByLabel('Descrição').fill('Topografia')
  await conta.getByLabel('Valor (R$)').fill('5.000,00')
  await conta.getByLabel('Vencimento').fill('2027-02-10')
  await conta.getByRole('button', { name: 'Registrar conta a pagar' }).click()
  await expect(conta.getByText('Conta a pagar registrada.')).toBeVisible()

  const abertas = secao(page, 'Contas a pagar em aberto')
  const topografia = abertas.getByRole('listitem').filter({ hasText: 'Topografia' }).first()
  const link = topografia.getByRole('link', { name: 'nota-topografia.pdf' })
  await expect(link).toBeVisible()
  const resposta = await page.request.get((await link.getAttribute('href'))!)
  expect(resposta.status()).toBe(200)
  expect(await resposta.text()).toContain('nota-topografia')

  // Anexo depois do lançamento
  await topografia.getByLabel('Anexar nota ou recibo').setInputFiles(pdf('recibo-topografia'))
  await topografia.getByRole('button', { name: 'Anexar', exact: true }).click()
  await expect(
    abertas
      .getByRole('listitem')
      .filter({ hasText: 'Topografia' })
      .first()
      .getByRole('link', { name: 'recibo-topografia.pdf' }),
  ).toBeVisible()
})
