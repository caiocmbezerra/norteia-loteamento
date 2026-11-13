import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

function dia(deslocamento: number) {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}
const pos = (linha: string, de: number, ate: number) => linha.slice(de - 1, ate)

// Fase 7b: a dona completa os dados da SPE, do empreendimento e do comprador e baixa a DIMOB.
test('DIMOB: pendências, dados fiscais e arquivo para o programa da Receita', async ({
  page,
}, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`dimob.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Dimob')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Dimob')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Dimob')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2021-01-04')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // Venda sem CPF, com a entrada paga.
  const dataVenda = dia(-1)
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Conceição Araújo')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('3')
  await page.getByLabel('Juros ao mês (%)').fill('0')
  await page.getByLabel('Data da venda').fill(dataVenda)
  await page.getByLabel('1ª parcela').fill(dia(30))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByLabel('Data do pagamento').fill(dataVenda)
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // DIMOB da SPE no ano da venda.
  await page.goto('/configuracoes/empresas')
  await page.locator('a[href^="/spes/"]').first().click()
  await page.getByRole('link', { name: 'DIMOB', exact: true }).click()
  const ano = dataVenda.slice(0, 4)
  await page.getByRole('link', { name: ano, exact: true }).click()
  await expect(page.getByRole('heading', { name: `DIMOB ${ano}` })).toBeVisible()
  await expect(page.getByText(/CPF\/CNPJ do comprador ausente/)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Baixar arquivo para o programa da Receita' }),
  ).toBeDisabled()

  await page.getByLabel('CPF de Conceição Araújo').fill('529.982.247-25')
  await page.getByRole('button', { name: 'Salvar CPF' }).click()
  await expect(page.getByText(/CPF\/CNPJ do comprador ausente/)).toHaveCount(0)

  await page.getByLabel('CNPJ da SPE').fill('11.222.333/0001-81')
  await page.getByLabel('Endereço completo da SPE').fill('Av. Goiás, 100, Centro, Goiânia')
  await page.getByLabel('UF da SPE').selectOption('GO')
  await page.getByLabel('Município da SPE (código Receita)').fill('9373')
  await page.getByLabel('CPF do responsável perante a Receita').fill('52998224725')
  await page.getByRole('button', { name: 'Salvar dados da SPE' }).click()
  await expect(page.getByText('Dados da SPE salvos.')).toBeVisible()

  await page.getByLabel('CEP').fill('74000-000')
  await page.getByLabel('Município (código Receita)').fill('9373')
  await page.getByRole('button', { name: 'Salvar dados do empreendimento' }).click()
  await expect(page.getByText('Dados do empreendimento salvos.')).toBeVisible()
  await expect(page.getByText('Nenhuma pendência: o arquivo pode ser gerado.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumo da DIMOB' })).toContainText(
    /Pago no ano\s*R\$\s9\.000,00/,
  )

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar arquivo para o programa da Receita' }).click(),
  ])
  expect(download.suggestedFilename()).toBe(`DIMOB_11222333000181_${ano}.TXT`)
  const linhas = readFileSync((await download.path())!, 'latin1').split('\r\n')
  expect(linhas.map((l) => l.slice(0, 3))).toEqual(['DIM', 'R01', 'R03', 'T9 ', ''])
  const r03 = linhas[2]!
  expect(pos(r03, 29, 42).trim()).toBe('52998224725')
  expect(pos(r03, 43, 102).trim()).toBe('CONCEICAO ARAUJO')
  expect(pos(r03, 117, 130)).toBe('00000009000000')
  expect(pos(r03, 131, 144)).toBe('00000000900000')
  expect(pos(r03, 206, 213)).toBe('74000000')
})
