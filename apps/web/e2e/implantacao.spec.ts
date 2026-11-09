import { expect, test } from '@playwright/test'

// Lista de implantação: o que já está pronto e o que falta, com o link para resolver.
test('implantação mostra os passos da loteadora nova', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page
    .getByLabel('E-mail')
    .fill(`implantacao.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Implantação')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Implantação')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Implantação')

  await page.goto('/configuracoes')
  await page.getByRole('link', { name: /Implantação/ }).click()
  await expect(page.getByRole('heading', { name: 'Implantação' })).toBeVisible()
  const passos = page.getByRole('list', { name: 'Passos da implantação' })
  await expect(passos.getByRole('listitem')).toHaveCount(10)
  await expect(page.getByText(/0 de 6 passos essenciais concluídos/)).toBeVisible()
  await expect(
    passos.getByRole('listitem').filter({ hasText: 'Regras jurídicas e fiscais confirmadas' }),
  ).toContainText(/ainda na sugestão da plataforma/)
  await passos
    .getByRole('listitem')
    .filter({ hasText: 'CNPJ das SPEs' })
    .getByRole('link', { name: 'Resolver' })
    .click()
  await expect(page).toHaveURL(/\/configuracoes\/empresas$/)
})
