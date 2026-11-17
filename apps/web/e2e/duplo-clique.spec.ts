import { expect, test } from '@playwright/test'

/** Data AAAA-MM-DD deslocada em dias a partir de hoje (fuso de São Paulo). */
function dia(deslocamento: number) {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

// Auditoria de QA (docs/qa-norteia-loteamento/08, duplo clique): a baixa manual não tem
// referência externa, então só a tela impede o envio repetido. Depois do primeiro recebimento o
// formulário volta preenchido com o saldo; uma segunda clicada logo em seguida não pode pagá-lo.
test('clique repetido em registrar recebimento gera um único recebimento', async ({
  page,
}, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Duda Duplo Clique')
  await page.getByLabel('E-mail').fill(`duplo.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Duplo Clique')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Duplo')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Duplo')
  const empreendimento = page.url().split('?')[0]!

  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Dora Compradora')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('3')
  await page.getByLabel('Juros ao mês (%)').fill('0')
  await page.getByLabel('Data da venda').fill(dia(-10))
  await page.getByLabel('1ª parcela').fill(dia(20))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()

  // Pagamento parcial da entrada (1.000,00 de 9.000,00) e uma segunda clicada 150 ms depois.
  await expect(page.getByRole('heading', { name: /Receber a entrada/ })).toBeVisible()
  await page.getByLabel('Data do pagamento').fill(dia(-10))
  await page.getByLabel('Parcela paga (R$)').fill('1.000,00')
  const botao = page.getByRole('button', { name: /Registrar recebimento|Registrando/ })
  await botao.click()
  await page.waitForTimeout(150)
  await botao.click({ force: true }) // force: clica mesmo se o botão estiver travado
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()
  await page.waitForLoadState('networkidle')

  // Um único recebimento: a entrada fica com 8.000,00 em aberto (não 7.000,00).
  await page.reload()
  await expect(page.getByRole('heading', { name: /Receber a entrada/ })).toBeVisible()
  await expect(page.getByLabel('Parcela paga (R$)')).toHaveValue('8.000,00')
})
