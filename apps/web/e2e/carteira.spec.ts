import { expect, test } from '@playwright/test'
import PizZip from 'pizzip'

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

  // Reajuste IPCA: aniversário ainda não chegou
  await expect(page.getByRole('heading', { name: 'Reajuste (IPCA)' })).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar reajustes pendentes' }).click()
  await expect(page.getByText(/Nenhum reajuste a aplicar agora/)).toBeVisible()
  await page.goto(`${empreendimento}/carteira`)
  await expect(page.getByRole('row', { name: /Carla Compradora/ })).toContainText('2 em atraso')

  // Cessão da carteira: sem taxa nem perda, vale o nominal (3 parcelas abertas após o estorno)
  await page.getByLabel('Taxa de desconto (% ao mês)').fill('0')
  await page.getByLabel('Perda esperada (%)').fill('0')
  await page.getByRole('button', { name: 'Simular' }).click()
  const cessao = page.getByRole('region', { name: 'Resultado da cessão' })
  await expect(cessao).toContainText(/Valor da cessão\s*R\$\s81\.000,00/)

  // Painel consolidado da loteadora
  await page.goto('/painel')
  const consolidado = page.getByRole('region', { name: 'Consolidado' })
  await expect(consolidado).toContainText(/VGV vendido\s*R\$\s90\.000,00/)
  await expect(consolidado).toContainText(/Carteira a receber\s*R\$\s81\.000,00/)
  await expect(page.getByRole('row', { name: /Jardim Carteira/ })).toContainText('sem plano')
})

// Fase 5c-1: renegociação por aditivo, antecipação e termo de quitação.
test('renegociação, antecipação e termo de quitação', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Rê Renegocia')
  await page.getByLabel('E-mail').fill(`aditivo.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Aditivo')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Aditivo')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Aditivo')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()

  // Entrada 9.000 + 2 parcelas a 1% a.m.; a 1ª já venceu
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Rita Renegociada')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('2')
  await page.getByLabel('Juros ao mês (%)').fill('1')
  await page.getByLabel('Data da venda').fill(dia(-40))
  await page.getByLabel('1ª parcela').fill(dia(-10))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByLabel('Data do pagamento').fill(dia(-40))
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // Renegociação: saldo + encargos da vencida em 1 parcela
  await page.getByText('Renegociar (aditivo)').click()
  await page.getByLabel('Parcelas', { exact: true }).last().fill('1')
  await page.locator('#ren-primeiraParcela').fill(dia(30))
  await page
    .getByLabel('Motivo (fica no aditivo e na auditoria)')
    .fill('Acordo de prazo com a compradora')
  await expect(page.getByText(/\+ encargos R\$/)).toBeVisible()
  await page.getByRole('button', { name: 'Registrar aditivo de renegociação' }).click()
  await expect(page.getByText(/Aditivo de renegociação registrado/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aditivos' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Renegociada' }).first()).toBeVisible()

  // Antecipação da parcela nova (com desconto dos juros) → quitação
  await page.getByText('Antecipar parcelas').click()
  await page.getByLabel('Todas (quitação antecipada)').check()
  await expect(page.getByText(/desconto dos juros não decorridos R\$\s[1-9]/)).toBeVisible()
  await page.getByRole('button', { name: 'Registrar antecipação' }).click()
  await expect(page.getByText('Antecipação registrada.')).toBeVisible()
  await page.getByRole('link', { name: 'Emitir termo de quitação' }).click()
  await expect(page.getByRole('heading', { name: 'Termo de quitação' })).toBeVisible()
  await expect(page.getByText(/Rita Renegociada/)).toBeVisible()
})

// Fase 5c-3a: cessão do contrato e troca de lote por aditivo.
test('cessão do contrato e troca de lote', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Ceci Cessão')
  await page.getByLabel('E-mail').fill(`cessao.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Cessão')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Cessão')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Cessão')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Clara Cedente')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('2')
  await page.getByLabel('1ª parcela').fill(dia(20))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // Cessão
  await page.getByText('Ceder contrato (aditivo)').click()
  await page.getByLabel('Nome do cessionário').fill('Caio Cessionário')
  await page.locator('#ces-motivo').fill('Venda dos direitos ao Caio')
  await page.getByRole('button', { name: 'Registrar aditivo de cessão' }).click()
  await expect(page.getByText(/Cessão registrada/)).toBeVisible()
  await expect(page.getByText(/Caio Cessionário · contrato/)).toBeVisible()

  // Troca para o lote 2 (mesmo preço de tabela)
  await page.getByText('Trocar de lote (aditivo)').click()
  await page.getByLabel('Novo lote', { exact: true }).selectOption({ label: 'Quadra A · Lote 2' })
  await expect(page.getByLabel('Preço do novo lote (R$)')).toHaveValue('90.000,00')
  await page.getByLabel('Parcelas do saldo').fill('3')
  await page.locator('#tro-motivo').fill('Troca a pedido do comprador')
  await page.getByRole('button', { name: 'Registrar aditivo de troca de lote' }).click()
  await expect(page.getByText(/Troca de lote registrada/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quadra A · Lote 2')
  await expect(page.getByText(/troca de lote:/)).toBeVisible()

  // Documentos em Word preenchidos com o modelo em uso
  const contrato = await page.request.get(
    (await page.getByRole('link', { name: 'Contrato', exact: true }).getAttribute('href'))!,
  )
  expect(contrato.status()).toBe(200)
  expect(contrato.headers()['content-disposition']).toContain('contrato-quadra-a-lote-2.docx')
  const xml = new PizZip(await contrato.body()).file('word/document.xml')!.asText()
  const texto = xml.replace(/<[^>]+>/g, '')
  expect(texto).toContain('Caio Cessionário')
  expect(texto).toContain('Lote 2 da Quadra A')
  expect(texto).toContain('R$\u00a090.000,00')
  expect(texto).not.toMatch(/\{[a-z_]+\}/)
  const aditivo = await page.request.get(
    (await page.getByRole('link', { name: 'baixar aditivo (Word)' }).last().getAttribute('href'))!,
  )
  expect(aditivo.status()).toBe(200)
  expect(aditivo.headers()['content-disposition']).toContain('aditivo-')
})

// Fase 6a: distrato com simulação, execução e devolução parcelada.
test('distrato: simulação, execução e devolução', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dani Distrato')
  await page.getByLabel('E-mail').fill(`distrato.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Distrato')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Distrato')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Distrato')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-01-02')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Distrato')

  // Custo próprio da loteadora no distrato, dentro do teto de 10%
  await page.goto('/configuracoes/distrato')
  await page.getByLabel('Nome do custo').fill('Documentação')
  await page.getByLabel('Valor sugerido (R$, opcional)').fill('1.000,00')
  await page.getByRole('button', { name: 'Cadastrar custo' }).click()
  await expect(page.getByText('Item cadastrado.')).toBeVisible()
  await expect(page.getByText(/Dentro do teto · sugerido R\$\s1\.000,00/)).toBeVisible()
  await page.goto(empreendimento)

  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Dora Desistente')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await page.getByLabel('Parcelas').fill('2')
  await page.getByLabel('Juros ao mês (%)').fill('0')
  await page.getByLabel('1ª parcela').fill(dia(20))
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await page.getByRole('link', { name: 'Ver parcelas' }).click()
  await page.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(page.getByText('Recebimento registrado.')).toBeVisible()

  // Com 10% + documentação, passa do teto: o sistema avisa
  await page.getByText('Distrato (art. 32-A)').click()
  await expect(page.getByLabel('Documentação (R$)')).toHaveValue('1.000,00')
  await page.getByRole('button', { name: 'Simular distrato' }).click()
  await expect(page.getByText(/acima do teto de R\$\s9\.000,00/)).toBeVisible()

  // Simulação: pago 9.000 − cláusula de 5% sobre 90.000 (4.500) − documentação (1.000) = 3.500
  await page.getByLabel('Cláusula penal (%)').fill('5')
  await page.getByRole('button', { name: 'Simular distrato' }).click()
  await expect(page.getByRole('row', { name: /Documentação/ })).toContainText(/R\$\s1\.000,00/)
  await expect(page.getByRole('row', { name: /Devolução ao comprador/ })).toContainText(
    /R\$\s3\.500,00/,
  )
  await expect(page.getByText(/acima do teto/)).toHaveCount(0)
  await expect(page.getByText(/12 parcela\(s\) de R\$\s291,66/)).toBeVisible()
  await page.getByLabel('Motivo do distrato').fill('Desistência da compradora')
  await page.getByRole('button', { name: 'Executar distrato' }).click()
  await expect(page.getByText(/Distrato executado/)).toBeVisible()
  await expect(page.getByText(/contrato Distratado/)).toBeVisible()
  await expect(page.getByText(/^Devolução \d+ · vence/)).toHaveCount(12)
  await page.getByRole('button', { name: 'Registrar pagamento' }).first().click()
  await expect(page.getByText(/paga em/)).toHaveCount(1)

  // O lote volta ao estoque
  await page.goto(empreendimento)
  await expect(page.getByRole('link', { name: /Quadra A, lote 1: disponível/i })).toBeVisible()
})
