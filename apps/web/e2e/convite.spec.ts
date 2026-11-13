import { type Page, expect, test } from '@playwright/test'

async function criarConta(page: Page, nome: string, email: string, proximo?: string) {
  await page.goto(proximo ? `/cadastrar?proximo=${encodeURIComponent(proximo)}` : '/cadastrar')
  await page.getByLabel('Seu nome').fill(nome)
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
}

test('dona convida corretor; corretor aceita e só consulta', async ({ browser }, info) => {
  const sufixo = `${Date.now()}.${info.project.name}`
  const dona = await (await browser.newContext()).newPage()
  const corretor = await (await browser.newContext()).newPage()

  // Dona cria a conta e o loteamento.
  await criarConta(dona, 'Ana Dona', `ana.${sufixo}@exemplo.com.br`)
  await dona.getByLabel('Nome da sua loteadora').fill('Loteadora Convite')
  await dona.getByLabel('Nome do empreendimento').fill('Jardim das Flores')
  await dona.getByLabel('Município').fill('Goiânia')
  await dona.getByLabel('UF').selectOption('GO')
  await dona.getByLabel('Quadras').fill('1')
  await dona.getByLabel('Lotes por quadra').fill('5')
  await dona.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(dona.getByRole('heading', { level: 1 })).toHaveText('Jardim das Flores')

  // Convida o corretor.
  await dona.goto('/configuracoes/membros')
  const emailCorretor = `caio.${sufixo}@exemplo.com.br`
  await dona.getByLabel('E-mail da pessoa').fill(emailCorretor)
  await dona.getByLabel('Papel').selectOption('corretor')
  await dona.getByRole('button', { name: 'Criar convite' }).click()
  const link = await dona.getByLabel('Link do convite').inputValue()
  expect(link).toMatch(/\/convite\/[0-9a-f]{64}$/)
  await expect(dona.getByText(emailCorretor)).toBeVisible()

  // Corretor abre o link, cria a conta e aceita.
  const caminho = new URL(link).pathname
  await corretor.goto(caminho)
  await corretor.getByRole('link', { name: 'Criar conta' }).click()
  await corretor.getByLabel('Seu nome').fill('Caio Corretor')
  await corretor.getByLabel('E-mail').fill(emailCorretor)
  await corretor.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await corretor.getByRole('button', { name: 'Criar conta' }).click()
  await expect(corretor).toHaveURL(new RegExp(`${caminho}$`))
  await corretor.getByRole('button', { name: 'Aceitar convite' }).click()

  // Corretor vê o empreendimento, mas não tem ações de edição.
  await expect(corretor.getByRole('heading', { name: 'Jardim das Flores' })).toBeVisible()
  await expect(corretor.getByRole('link', { name: 'Novo empreendimento' })).toHaveCount(0)
  await corretor.getByRole('heading', { name: 'Jardim das Flores' }).click()
  await expect(corretor.getByRole('link', { name: 'Editar dados' })).toHaveCount(0)

  // Corretor não edita o cadastro do lote, mas pode reservar (RN-C07).
  await corretor.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await expect(corretor.getByText('Cadastro do lote')).toHaveCount(0)
  await corretor.getByLabel('Nome do cliente').fill('Cliente do Caio')
  await corretor.getByRole('button', { name: 'Reservar lote' }).click()
  await expect(corretor.getByText(/Reservado para Cliente do Caio/)).toBeVisible()

  // A dona vê o corretor como membro e a ação na auditoria.
  await dona.goto('/configuracoes/membros')
  await expect(dona.getByText('Caio Corretor')).toBeVisible()
  await dona.goto('/configuracoes/auditoria?tabela=membros')
  await expect(dona.getByText(/Caio Corretor criou · Membros/)).toBeVisible()
})
