import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

function dia(deslocamento: number) {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}
const br = (iso: string) => iso.split('-').reverse().join('/')

// Fase 7c: o contador configura plano de contas e regras; a SPE mostra caixa × competência e
// exporta os lançamentos no formato escolhido.
test('exportação contábil configurável e caixa × competência', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`contabil.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Contábil')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Contábil')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Contábil')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2021-01-04')
  await page.getByRole('button', { name: 'Salvar' }).click()

  const dataVenda = dia(-1)
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Ana Compradora')
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

  // Configuração contábil
  await page.goto('/configuracoes/contabilidade')
  await page
    .getByLabel('Contas (uma por linha: código;nome)')
    .fill('1.1.1;Caixa\n1.1.2;Clientes a receber\n3.1.1;Receita de vendas de lotes')
  await page.getByRole('button', { name: 'Salvar contas' }).click()
  await expect(page.getByText('3 conta(s) salva(s).')).toBeVisible()

  const venda = page.getByRole('form', { name: 'Regra: Venda contratada (competência)' })
  await venda.getByLabel(/^Débito/).selectOption('1.1.2')
  await venda.getByLabel(/^Crédito/).selectOption('3.1.1')
  await venda.getByRole('button', { name: 'Salvar regra' }).click()
  await expect(venda.getByText('Regra salva.')).toBeVisible()
  const receb = page.getByRole('form', { name: 'Regra: Recebimento de parcela' })
  await receb.getByLabel(/^Débito/).selectOption('1.1.1')
  await receb.getByLabel(/^Crédito/).selectOption('1.1.2')
  await receb.getByLabel(/^Histórico/).fill('Receb. {documento}')
  await receb.getByRole('button', { name: 'Salvar regra' }).click()
  await expect(receb.getByText('Regra salva.')).toBeVisible()

  // Contábil da SPE
  await page.goto('/configuracoes/empresas')
  await page.locator('a[href^="/spes/"]').first().click()
  await page.getByRole('link', { name: 'Contábil', exact: true }).click()
  await page.getByLabel('De').fill(`${dataVenda.slice(0, 7)}-01`)
  await page.getByLabel('Até').fill(dataVenda)
  await page.getByRole('button', { name: 'Ver período' }).click()
  const tabela = page.getByRole('table', { name: 'Caixa por competência' })
  await expect(tabela.getByRole('row').nth(1)).toContainText(/R\$\s90\.000,00.*R\$\s9\.000,00/)
  await expect(page.getByText('Todos os 2 fatos do período têm regra.')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar lançamentos (2)' }).click(),
  ])
  const linhas = readFileSync((await download.path())!, 'utf8').split('\r\n')
  expect(linhas).toEqual([
    'Data;Debito;Credito;Valor;Historico;Documento',
    `${br(dataVenda)};1.1.2;3.1.1;90000,00;Venda QA L1 - Ana Compradora;CT 1`,
    `${br(dataVenda)};1.1.1;1.1.2;9000,00;Receb. CT 1 P0;CT 1 P0`,
    '',
  ])
})
