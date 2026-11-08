import { expect, test } from '@playwright/test'

// Modelos de documentos por cliente: baixar o modelo, enviar de volta (conferido) e recusar arquivo inválido.
test('dona envia o próprio modelo de contrato', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Mel Modelos')
  await page.getByLabel('E-mail').fill(`modelos.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Modelos')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Modelos')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Modelos')

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: /Modelos de documentos/ }).click()
  const cartao = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Contrato de compra e venda' }),
  })
  await expect(cartao.getByText('modelo padrão provisório')).toBeVisible()
  const modelo = await page.request.get('/configuracoes/modelos/contrato')
  expect(modelo.status()).toBe(200)
  const conteudo = await modelo.body()

  // Arquivo que não é Word é recusado
  await cartao.getByLabel('Arquivo do modelo (contrato)').setInputFiles({
    name: 'contrato.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('isto não é um docx'),
  })
  await cartao.getByRole('button', { name: 'Enviar meu modelo' }).click()
  await expect(cartao.getByText(/não é um Word \(\.docx\) válido/)).toBeVisible()

  // O modelo baixado volta como modelo próprio
  await cartao.getByLabel('Arquivo do modelo (contrato)').setInputFiles({
    name: 'contrato-do-meu-advogado.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: conteudo,
  })
  await cartao.getByRole('button', { name: 'Enviar meu modelo' }).click()
  await expect(cartao.getByText(/Modelo conferido e publicado/)).toBeVisible()
  await expect(cartao.getByText(/Seu modelo: contrato-do-meu-advogado\.docx/)).toBeVisible()
  await cartao.getByRole('button', { name: 'Voltar ao modelo padrão' }).click()
  await expect(cartao.getByText('modelo padrão provisório')).toBeVisible()
})
