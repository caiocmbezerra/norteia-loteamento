import { expect, test } from '@playwright/test'

// Fase 3: despesa comum rateada entre empreendimentos vira uma conta a pagar em cada um.
test('despesa comum rateada por percentuais vira conta em cada empreendimento', async ({
  page,
}, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Rui Rateio')
  await page.getByLabel('E-mail').fill(`rateio.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Rateio')
  await page.getByLabel('Nome do empreendimento').fill('Primeiro')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('2')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Primeiro')
  await page.getByRole('link', { name: 'Painel', exact: true }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  await page.getByRole('link', { name: 'Custos e obra' }).click()
  await page.getByRole('link', { name: 'Ratear despesa comum' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rateio de despesas comuns')

  // Por percentuais: 30% e 70% de R$ 3.000,00
  await page.getByLabel('Descrição').fill('Contabilidade de novembro')
  await page.getByLabel('Centro de custo').selectOption({ index: 1 })
  await page.getByLabel('Valor total (R$)').fill('3.000,00')
  await page.getByLabel('Critério do rateio').selectOption('manual')
  await page.getByLabel('Primeiro', { exact: true }).check()
  await page.getByLabel('Demonstração — Caso de referência', { exact: true }).check()
  await page.getByLabel('Percentual de Primeiro').fill('30')
  await page.getByLabel('Percentual de Demonstração — Caso de referência').fill('70')
  await page.getByRole('button', { name: 'Ratear despesa' }).click()
  await expect(page.getByText('Despesa rateada', { exact: false })).toBeVisible()
  const item = page
    .getByRole('heading', { name: 'Rateios recentes' })
    .locator('..')
    .getByRole('listitem')
    .filter({ hasText: 'Contabilidade de novembro' })
    .first()
  await expect(item).toContainText('por percentuais informados')
  await expect(item).toContainText(/Primeiro\s*R\$\s900,00/)
  await expect(item).toContainText(/Demonstração — Caso de referência\s*R\$\s2\.100,00/)

  // Só um empreendimento: recusado
  await page.getByLabel('Descrição').fill('Licença ambiental')
  await page.getByLabel('Centro de custo').selectOption({ index: 1 })
  await page.getByLabel('Valor total (R$)').fill('1.000,00')
  await page.getByLabel('Primeiro', { exact: true }).check()
  await page.getByRole('button', { name: 'Ratear despesa' }).click()
  await expect(page.getByText('Marque ao menos dois empreendimentos.')).toBeVisible()

  // A conta aparece nos custos do empreendimento
  await page.goto('/painel')
  await page.getByRole('link', { name: 'Primeiro' }).first().click()
  await page.getByRole('link', { name: 'Custos e obra' }).click()
  await expect(page.getByText('Contabilidade de novembro (rateio)')).toBeVisible()
})
