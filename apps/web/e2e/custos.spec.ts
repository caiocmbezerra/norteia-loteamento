import { type Page, expect, test } from '@playwright/test'

// Fase 3: contrato → medição → pagamento → estorno, sempre com orçado = pago + contratado + a contratar.
const secao = (page: Page, titulo: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: titulo, exact: true }) })

const linhaCentro = (page: Page, nome: string) =>
  secao(page, 'Por centro de custo')
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: nome, exact: true }) })

test('custos da obra alimentam o fluxo sem dupla contagem', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Edu Engenheiro')
  await page.getByLabel('E-mail').fill(`custos.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Obra')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')

  // Fornecedor
  await page.goto('/configuracoes/fornecedores')
  await page.getByLabel('Nome').fill('Terraplenagem Silva')
  await page.getByLabel('CPF ou CNPJ (opcional)').fill('11.222.333/0001-81')
  await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click()
  await expect(page.getByText('11.222.333/0001-81')).toBeVisible()

  // Demonstração e custos
  await page.getByRole('link', { name: 'Painel' }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await page.getByRole('link', { name: 'Custos e obra' }).click()
  const resumo = page.getByRole('region', { name: 'Resumo de custos' })
  await expect(resumo).toContainText(/Orçado\s*R\$\s4\.434\.000,00/)
  await page.getByRole('button', { name: 'Revisar orçamento' }).click()
  await expect(resumo.getByText('orçamento revisado')).toBeVisible()

  // Contrato em subcentro consome o orçamento de Infraestrutura
  const contrato = secao(page, 'Novo contrato')
  await contrato
    .getByLabel('Fornecedor', { exact: true })
    .selectOption({ label: 'Terraplenagem Silva' })
  await contrato
    .getByLabel('Centro de custo', { exact: true })
    .selectOption({ label: 'Terraplenagem' })
  await contrato.getByLabel('Descrição do contrato').fill('Terraplenagem completa')
  await contrato.getByLabel('Valor (R$)').fill('500.000,00')
  await contrato.getByLabel('Início').fill('2027-01-01')
  await contrato.getByLabel('Término previsto').fill('2027-06-30')
  await contrato.getByRole('button', { name: 'Registrar contrato' }).click()
  await expect(contrato.getByText('Contrato registrado.')).toBeVisible()

  const conta = secao(page, 'Nova conta a pagar')
  await conta
    .getByLabel('Contrato', { exact: true })
    .selectOption({ label: 'Terraplenagem completa' })
  await conta.getByLabel('Descrição').fill('Medição 1')
  await conta.getByLabel('Valor (R$)').fill('200.000,00')
  await conta.getByLabel('Vencimento').fill('2027-02-10')
  await conta.getByRole('button', { name: 'Registrar conta a pagar' }).click()
  await expect(conta.getByText('Conta a pagar registrada.')).toBeVisible()

  const infra = linhaCentro(page, 'Infraestrutura')
  await expect(infra).toContainText(
    /R\$\s3\.000\.000,00.*R\$\s0,00.*R\$\s500\.000,00.*R\$\s2\.500\.000,00.*R\$\s3\.000\.000,00/,
  )

  // Pagamento da medição
  const abertas = secao(page, 'Contas a pagar em aberto')
  await abertas.getByRole('button', { name: 'Pagar' }).click()
  await expect(resumo).toContainText(/Pago \(realizado\)\s*R\$\s200\.000,00/)
  await expect(infra).toContainText(
    /R\$\s3\.000\.000,00.*R\$\s200\.000,00.*R\$\s300\.000,00.*R\$\s2\.500\.000,00/,
  )

  // Estorno exige motivo e devolve o valor para contratado
  const pagos = secao(page, 'Pagamentos recentes')
  await pagos.getByRole('button', { name: 'Estornar' }).click()
  await expect(pagos.getByText('Informe o motivo do estorno.')).toBeVisible()
  await pagos.getByLabel('Motivo do estorno').fill('Pago em duplicidade')
  await pagos.getByRole('button', { name: 'Estornar' }).click()
  await expect(pagos.getByText('Estornado: Pago em duplicidade')).toBeVisible()
  await expect(infra).toContainText(/R\$\s3\.000\.000,00.*R\$\s0,00.*R\$\s500\.000,00/)

  // TIR do plano e atual aparecem lado a lado
  await expect(resumo).toContainText(/19,3% →/)
})
