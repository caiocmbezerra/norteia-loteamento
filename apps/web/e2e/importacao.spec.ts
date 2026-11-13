import { expect, test } from '@playwright/test'

// Fase 8a: carteira de outro sistema importada pela planilha, com mapeamento de colunas e
// conciliação do saldo em aberto.
test('importa carteira de outro sistema com saldo conciliado', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`importa.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Importa')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Importa')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Importa')
  const empreendimento = page.url().split('?')[0]!
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2021-01-04')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await page.goto(`${empreendimento}/carteira`)
  await page.getByRole('link', { name: 'Importar carteira' }).click()
  await expect(page.getByRole('heading', { name: 'Importar carteira' })).toBeVisible()
  await page.getByLabel('Sistema de origem').fill('Sistema Antigo')

  // Colunas com os nomes do sistema de origem (mapeadas automaticamente).
  const csv = [
    'Cód. Contrato;QD;LT;Cliente;CPF;Data Contrato;Valor Total;Indexador;Parcela;Data Vencimento;Valor Parcela;Valor Recebido;Data Recebimento',
    'C-1;A;1;Maria da Silva;529.982.247-25;10/01/2024;90.000,00;IPCA;0;10/01/2024;9.000,00;9.000,00;10/01/2024',
    'C-1;A;1;Maria da Silva;529.982.247-25;10/01/2024;90.000,00;IPCA;1;10/02/2024;40.500,00;40.500,00;10/02/2024',
    'C-1;A;1;Maria da Silva;529.982.247-25;10/01/2024;90.000,00;IPCA;2;10/03/2030;40.500,00;;',
    'C-2;A;2;João Souza;;05/05/2024;80.000,00;;1;05/06/2030;80.000,00;;',
  ].join('\r\n')
  await page.getByLabel('Planilha (CSV)').setInputFiles({
    name: 'carteira.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })
  await expect(page.getByLabel('Contrato (código na origem) *')).toHaveValue('0')
  const conferencia = page.getByRole('region', { name: 'Conferência' })
  await expect(conferencia).toContainText(/2 contrato\(s\), 4 parcela\(s\)/)
  await expect(conferencia).toContainText(/saldo em aberto R\$\s120\.500,00/)

  await page.getByLabel('Saldo em aberto no sistema de origem (R$)').fill('120.000,00')
  await expect(page.getByText(/Não confere: a planilha soma/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar 2 contrato(s)' })).toBeDisabled()
  await page.getByLabel('Saldo em aberto no sistema de origem (R$)').fill('120.500,00')
  await expect(page.getByText('Saldo conciliado com o sistema de origem.')).toBeVisible()
  await page.getByRole('button', { name: 'Importar 2 contrato(s)' }).click()
  await expect(page.getByText('2 contrato(s) importado(s).')).toBeVisible()

  await page.getByRole('link', { name: 'Ver a carteira' }).click()
  await expect(page.getByRole('region', { name: 'Resumo da carteira' })).toContainText(
    /Saldo a receber\s*R\$\s120\.500,00/,
  )
  await expect(page.getByRole('row', { name: /Maria da Silva/ })).toBeVisible()

  // A próxima importação lembra o mapeamento e registra o histórico.
  await page.goto(`${empreendimento}/carteira/importar`)
  await expect(
    page.getByText(/Sistema Antigo \(carteira\.csv\) · 2 contrato\(s\), 4 parcela\(s\)/),
  ).toBeVisible()
})
