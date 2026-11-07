import { expect, test } from '@playwright/test'

// Fluxo do pequeno loteador (roadmap Fase 1): criar conta → cadastrar loteamento em uma tela
// → ver os lotes → ajustar um lote. Cada execução usa um e-mail novo.
test('pequeno loteador cria conta, loteamento e ajusta um lote', async ({ page }, info) => {
  const email = `loteador.${Date.now()}.${info.project.name}@exemplo.com.br`

  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Marina Souza')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()

  await expect(page).toHaveURL(/\/comecar$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Marina, vamos cadastrar')

  // Erros aparecem por campo, em português.
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByText('Nome da loteadora: informe ao menos 2 caracteres.')).toBeVisible()

  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Horizonte')
  await page.getByLabel('Nome do empreendimento').fill('Residencial Bela Vista')
  await page.getByLabel('Município').fill('Uberlândia')
  await page.getByLabel('UF').selectOption('MG')
  await page.getByLabel('Quadras').fill('3')
  await page.getByLabel('Lotes por quadra').fill('34')
  await page.getByLabel('Área de cada lote (m²)').fill('300')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Residencial Bela Vista')
  await expect(page.getByText('Empreendimento criado com 102 lotes.')).toBeVisible()
  await expect(page.getByText('Vendas bloqueadas até o registro do loteamento')).toBeVisible()
  await expect(page.getByText('R$ 9.180.000,00')).toBeVisible()

  // Ajusta um lote: vira permuta e sai do VGV de tabela.
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quadra A · Lote 1')
  await page.getByLabel('Situação').selectOption('permuta')
  await page.getByLabel('Área (m²)').fill('312,50')
  await page.getByRole('button', { name: 'Salvar lote' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Residencial Bela Vista')
  await expect(page.getByText('R$ 9.090.000,00')).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Quadra A, lote 1: Permuta, 312,50 m²/ }),
  ).toBeVisible()

  // Painel mostra o empreendimento.
  await page.getByRole('link', { name: 'Painel' }).click()
  await expect(page.getByRole('heading', { name: 'Residencial Bela Vista' })).toBeVisible()
})
