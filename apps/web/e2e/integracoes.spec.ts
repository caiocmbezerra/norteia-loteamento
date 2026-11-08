import { expect, test } from '@playwright/test'

// Fase 5b-2: configuração do Asaas (a chave é conferida no banco) e webhook protegido por token.
test('dona configura o Asaas; chave errada não é aceita', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`asaas.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Asaas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Asaas')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Asaas')

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: /Integrações/ }).click()
  await expect(page.getByText('Não configurada')).toBeVisible()
  await page.getByLabel('Chave da API do Asaas').fill('$aact_prod_000000000000000000000')
  await page.getByRole('button', { name: 'Conectar Asaas' }).click()
  await expect(page.getByText(/A chave não corresponde ao ambiente escolhido/)).toBeVisible()
  await expect(page.getByLabel('Chave da API do Asaas')).toHaveValue('')
  await expect(page.getByText('Não configurada')).toBeVisible()
})

test('webhook sem token válido é recusado', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'teste de API: roda uma vez')
  const corpo = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_x' } }
  const semToken = await request.post('/api/webhooks/asaas/00000000-0000-0000-0000-000000000000', {
    data: corpo,
  })
  expect(semToken.status()).toBe(401)
  const tokenErrado = await request.post(
    '/api/webhooks/asaas/00000000-0000-0000-0000-000000000000',
    { data: corpo, headers: { 'asaas-access-token': 'qualquer' } },
  )
  expect(tokenErrado.status()).toBe(401)
  const tenantInvalido = await request.post('/api/webhooks/asaas/abc', {
    data: corpo,
    headers: { 'asaas-access-token': 'qualquer' },
  })
  expect(tenantInvalido.status()).toBe(401)
})
