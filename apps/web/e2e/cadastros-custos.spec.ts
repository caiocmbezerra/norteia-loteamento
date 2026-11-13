import { type Page, expect, test } from '@playwright/test'

const secao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

// Fase 3: centro de custo próprio, cancelamento de conta e encerramento de contrato.
test('centro próprio, conta cancelada e contrato encerrado', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Cid Custos')
  await page.getByLabel('E-mail').fill(`centros.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Centros')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')

  // Centros próprios
  await page.goto('/configuracoes')
  await page.getByRole('link', { name: /Centros de custo/ }).click()
  await page.getByLabel('Nome do centro').fill('Seguros da obra')
  await page.getByRole('button', { name: 'Criar centro de custo' }).click()
  await expect(page.getByText('Centro de custo criado.')).toBeVisible()
  await page.getByLabel('Nome do centro').fill('Taxas cartoriais')
  await page.getByLabel('Dentro de').selectOption({ label: 'Aprovação e registro' })
  await page.getByRole('button', { name: 'Criar centro de custo' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Taxas cartoriais' })).toBeVisible()
  await page.getByLabel('Nome do centro').fill('Seguros da obra')
  await page.getByRole('button', { name: 'Criar centro de custo' }).click()
  await expect(page.getByText('Já existe um centro com esse nome aqui.')).toBeVisible()

  // Conta no centro próprio, cancelada com motivo
  await page.goto('/painel')
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  await page.getByRole('link', { name: 'Custos e obra' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Custos e obra')
  const custos = page.url()
  const conta = secao(page, 'Nova conta a pagar')
  await conta.getByLabel('Centro de custo (avulsa)').selectOption({ label: 'Seguros da obra' })
  await conta.getByLabel('Descrição').fill('Seguro de obra lançado em dobro')
  await conta.getByLabel('Valor (R$)').fill('1.000,00')
  await conta.getByLabel('Vencimento').fill('2027-03-10')
  await conta.getByRole('button', { name: 'Registrar conta a pagar' }).click()
  await expect(conta.getByText('Conta a pagar registrada.')).toBeVisible()
  const abertas = secao(page, 'Contas a pagar em aberto')
  const seguro = abertas
    .getByRole('listitem')
    .filter({ hasText: 'Seguro de obra lançado em dobro' })
  await seguro.locator('summary', { hasText: 'Cancelar conta' }).click()
  await seguro.getByRole('button', { name: 'Cancelar conta' }).click()
  await expect(seguro.getByRole('alert')).toContainText('Informe o motivo do cancelamento.')
  await seguro.getByLabel('Motivo do cancelamento').fill('Lançamento duplicado')
  await seguro.getByRole('button', { name: 'Cancelar conta' }).click()
  await expect(abertas.getByText('Seguro de obra lançado em dobro')).toHaveCount(0)

  // Contrato encerrado
  await page.goto('/configuracoes/fornecedores')
  await page.getByLabel('Nome').fill('Topografia Lima')
  await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click()
  await expect(page.getByText('Topografia Lima')).toBeVisible()
  await page.goto(custos)
  const contrato = secao(page, 'Novo contrato')
  await contrato
    .getByLabel('Fornecedor', { exact: true })
    .selectOption({ label: 'Topografia Lima' })
  await contrato
    .getByLabel('Centro de custo', { exact: true })
    .selectOption({ label: 'Taxas cartoriais' })
  await contrato.getByLabel('Descrição do contrato').fill('Levantamento topográfico')
  await contrato.getByLabel('Valor (R$)').fill('20.000,00')
  await contrato.getByLabel('Início').fill('2026-01-01')
  await contrato.getByLabel('Término previsto').fill('2026-12-31')
  await contrato.getByRole('button', { name: 'Registrar contrato' }).click()
  await expect(contrato.getByText('Contrato registrado.')).toBeVisible()
  const topo = secao(page, 'Contratos com fornecedores')
    .getByRole('listitem')
    .filter({ hasText: 'Levantamento topográfico' })
  await topo.locator('summary', { hasText: 'Encerrar contrato' }).click()
  await topo.getByRole('button', { name: 'Confirmar encerramento' }).click()
  await expect(topo.getByText('Contrato encerrado.')).toBeVisible()

  // Centro desativado sai das listas de lançamento
  await page.goto('/configuracoes/centros-custo')
  await page.getByRole('button', { name: 'Desativar Seguros da obra' }).click()
  await expect(page.getByRole('button', { name: 'Reativar Seguros da obra' })).toBeVisible()
  await page.goto(custos)
  await expect(
    secao(page, 'Nova conta a pagar')
      .getByLabel('Centro de custo (avulsa)')
      .locator('option', { hasText: 'Seguros da obra' }),
  ).toHaveCount(0)
})
