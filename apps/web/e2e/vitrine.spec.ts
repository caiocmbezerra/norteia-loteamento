import { expect, test } from '@playwright/test'

// D-118: a loteadora publica a vitrine; um visitante sem login vê os lotes e manda interesse,
// que vira lead da loteadora.
test('vitrine pública: publicar, ver sem login e registrar interesse', async ({
  browser,
}, info) => {
  const sufixo = `${Date.now()}.${info.project.name}`
  const dona = await (await browser.newContext()).newPage()
  await dona.goto('/cadastrar')
  await dona.getByLabel('Seu nome').fill('Vera Vitrine')
  await dona.getByLabel('E-mail').fill(`vitrine.${sufixo}@exemplo.com.br`)
  await dona.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await dona.getByRole('button', { name: 'Criar conta' }).click()
  await dona.getByLabel('Nome da sua loteadora').fill('Loteadora Vitrine')
  await dona.getByLabel('Nome do empreendimento').fill('Recanto das Águas')
  await dona.getByLabel('Município').fill('Goiânia')
  await dona.getByLabel('UF').selectOption('GO')
  await dona.getByLabel('Lotes por quadra').fill('3')
  await dona.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await dona.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(dona.getByRole('heading', { level: 1 })).toHaveText('Recanto das Águas')
  const empreendimento = dona.url().split('?')[0]!

  await dona.goto(`${empreendimento}/comercial`)
  await dona.getByLabel('Situação').selectOption('sim')
  await dona.getByLabel('Preço na vitrine').selectOption('lote')
  await dona.getByLabel('Apresentação (opcional)').fill('Lotes de 300 m² perto do lago.')
  await dona.getByRole('button', { name: 'Salvar vitrine' }).click()
  await expect(dona.getByText('Vitrine publicada.')).toBeVisible()
  const link = await dona
    .getByRole('link', { name: /\/v\/recanto-das-aguas-/ })
    .getAttribute('href')
  expect(link).toMatch(/\/v\/recanto-das-aguas-[a-z0-9]{5}$/)

  // Visitante sem login
  const visitante = await (await browser.newContext()).newPage()
  await visitante.goto(new URL(link!).pathname)
  await expect(
    visitante.getByRole('heading', { level: 1, name: 'Recanto das Águas' }),
  ).toBeVisible()
  await expect(visitante.getByText('Lotes de 300 m² perto do lago.')).toBeVisible()
  await expect(visitante.getByText('A partir de')).toBeVisible()
  await visitante
    .getByRole('link', { name: /Lote 2/ })
    .first()
    .click()
  await visitante.getByLabel('Seu nome').fill('Paulo Interessado')
  await visitante.getByLabel('WhatsApp ou telefone').fill('(62) 99999-0000')
  await expect(visitante.getByLabel('Lote de interesse (opcional)')).toHaveValue(/[0-9a-f-]{36}/)
  await visitante.getByRole('checkbox').check()
  await visitante.getByRole('button', { name: 'Tenho interesse' }).click()
  await expect(visitante.getByText(/Recebemos seu interesse/)).toBeVisible()

  // Vira lead da loteadora
  await dona.goto(`${empreendimento}/comercial/leads`)
  await expect(dona.getByText('Paulo Interessado', { exact: true })).toBeVisible()
})
