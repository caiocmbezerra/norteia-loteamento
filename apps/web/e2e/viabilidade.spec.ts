import { expect, test } from '@playwright/test'

// Fase 2: empreendimento de demonstração com o caso de referência, indicadores do motor na
// tela, plano original congelado e revisão com motivo.
test('demonstração mostra o caso de referência e permite revisar o plano', async ({
  page,
}, info) => {
  const email = `demo.${Date.now()}.${info.project.name}@exemplo.com.br`
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Diana Demo')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Demo')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Uberlândia')
  await page.getByLabel('UF').selectOption('MG')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')

  // Cria a demonstração pelo painel.
  await page.getByRole('link', { name: 'Painel' }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  // 102 lotes à venda menos as vendas fictícias da demonstração (até 15, uma por mês desde jan/2026).
  const disponiveis = Number(
    (await page
      .getByText(/\d+ disponíveis/)
      .first()
      .textContent())!.match(/(\d+) disponíveis/)![1],
  )
  expect(disponiveis).toBeGreaterThanOrEqual(87)
  expect(disponiveis).toBeLessThanOrEqual(102)

  // Plano original já aprovado com os números da especificação.
  await page.getByRole('link', { name: 'Viabilidade' }).click()
  await expect(page.getByRole('cell', { name: '19,3%' })).toBeVisible()
  await page.getByRole('link', { name: 'Original' }).click()
  const indicadores = page.getByRole('region', { name: 'Indicadores' })
  await expect(indicadores.getByText('19,3%')).toBeVisible()
  await expect(indicadores.getByText(/R\$\s515\.115,69/)).toBeVisible()
  await expect(indicadores.getByText(/R\$\s3\.447\.951,42/)).toBeVisible()
  await expect(indicadores.getByText('76 / 115')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Vendas na metade da velocidade' })).toBeVisible()
  await expect(page.getByText(/Plano vigente — congelado/)).toBeVisible()

  // Revisão: novo estudo com infraestrutura mais cara exige motivo.
  await page.getByRole('link', { name: /Viabilidade ·/ }).click()
  await page.getByRole('button', { name: 'Novo estudo' }).click()
  await expect(page.getByText('Preencha os custos do empreendimento.')).toBeVisible()
  await page.getByLabel('Tributos sobre o recebido (%)').fill('5,93')
  await page.getByLabel('Custo 1: valor').fill('400.000,00')
  await page.getByLabel('Custo 3: valor').fill('3.450.000,00')
  await page.getByRole('button', { name: 'Salvar e calcular' }).click()
  await expect(page.getByRole('region', { name: 'Indicadores' })).toBeVisible()
  await page.getByRole('button', { name: 'Aprovar revisão do plano' }).click()
  await expect(page.getByText('Informe o motivo da revisão do plano (RN-F16).')).toBeVisible()
  await page.getByLabel('Motivo da revisão').fill('Orçamento de infraestrutura revisado')
  await page.getByRole('button', { name: 'Aprovar revisão do plano' }).click()
  await expect(page.getByText('Revisão 1 do plano aprovada.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Original' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Revisão 1' })).toBeVisible()
  await expect(page.getByText('Orçamento de infraestrutura revisado')).toBeVisible()
})
