import { expect, test } from '@playwright/test'

/** Data AAAA-MM-DD deslocada em dias a partir de hoje (fuso de São Paulo). */
function dia(deslocamento: number) {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

// Fase 5a: venda gera contrato; recebimento em dia e em atraso (multa e juros de mora);
// estorno reabre a parcela; carteira mostra o vencido.
test('contrato, recebimentos com encargos e estorno', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Fê Financeira')
  await page.getByLabel('E-mail').fill(`carteira.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Carteira')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Carteira')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Carteira')
  const empreendimento = page.url().split('?')[0]!

  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // Venda: entrada 9.000 + 3 × 27.000 sem juros; 1ª parcela vencida há ~40 dias
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Carla Compradora')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('3')
  await page.getByLabel('Juros ao mês (%)').fill('0')
  await page.getByLabel('Data da venda').fill(dia(-70))
  await page.getByLabel('1ª parcela').fill(dia(-40))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quadra A · Lote 1')

  // Entrada paga em dia
  await expect(page.getByRole('heading', { name: /Receber a entrada/ })).toBeVisible()
  await page.getByLabel('Data do pagamento').fill(dia(-70))
  await expect(page.getByText('Em dia: sem multa nem juros de mora.')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // Parcela 1 paga hoje, com atraso: multa 2% = 540,00
  await expect(page.getByRole('heading', { name: /Receber a parcela 1/ })).toBeVisible()
  await expect(page.getByText(/dia\(s\) de atraso · multa R\$\s540,00/)).toBeVisible()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Receber a parcela 2/ })).toBeVisible()

  // Carteira: parcela 2 (vencida há ~10 dias) em atraso
  await page.goto(`${empreendimento}/carteira`)
  const resumo = page.getByRole('region', { name: 'Resumo da carteira' })
  await expect(resumo).toContainText(/Saldo a receber\s*R\$\s54\.000,00/)
  await expect(resumo).toContainText(/Vencido\s*R\$\s27\.000,00/)
  await expect(page.getByRole('row', { name: /Carla Compradora/ })).toContainText('1 em atraso')

  // Estorno da parcela 1
  await page.getByRole('link', { name: 'Quadra A · Lote 1' }).click()
  const linha = page.getByRole('row').filter({ hasText: /^1/ }).first()
  await linha.getByLabel('Motivo do estorno').fill('cheque devolvido')
  await linha.getByRole('button', { name: 'Estornar' }).click()
  await expect(page.getByText('Recebimento estornado.')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Receber a parcela 1/ })).toBeVisible()
  await page.goto(`${empreendimento}/carteira`)
  await expect(page.getByRole('row', { name: /Carla Compradora/ })).toContainText('2 em atraso')
})
