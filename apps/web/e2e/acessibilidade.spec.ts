import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Acessibilidade (WCAG 2.1 A/AA) das telas principais, com a demonstração carregada.
// Falham apenas violações graves ou críticas; as demais aparecem no relatório do axe.
test('telas principais sem violações graves de acessibilidade', async ({ page }, info) => {
  test.setTimeout(120_000)
  const problemas: string[] = []
  const verificar = async (rotulo: string) => {
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
      problemas.push(
        `${rotulo} · ${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
      )
  }

  await page.goto('/entrar')
  await verificar('/entrar')
  await page.goto('/cadastrar')
  await verificar('/cadastrar')
  await page.getByLabel('Seu nome').fill('Dora Dona')
  await page.getByLabel('E-mail').fill(`a11y.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora A11y')
  await verificar('/comecar')
  await page.getByLabel('Nome do empreendimento').fill('Jardim A11y')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('1')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim A11y')
  await page.getByRole('link', { name: 'Painel', exact: true }).click()
  await page.getByRole('button', { name: 'Criar demonstração' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Demonstração — Caso de referência',
  )
  const empreendimento = page.url().split('?')[0]!

  const telas = [
    '/painel',
    empreendimento,
    `${empreendimento}/viabilidade`,
    `${empreendimento}/custos`,
    `${empreendimento}/comercial`,
    `${empreendimento}/comercial/precos`,
    `${empreendimento}/comercial/leads`,
    `${empreendimento}/planta`,
    `${empreendimento}/carteira`,
    `${empreendimento}/carteira/importar`,
    '/alertas',
    '/rateios',
    '/atendimento',
    '/assistente',
    '/configuracoes',
    '/configuracoes/parametros',
    '/configuracoes/centros-custo',
    '/configuracoes/distrato',
    '/configuracoes/contabilidade',
    '/configuracoes/implantacao',
  ]
  for (const tela of telas) {
    await page.goto(tela)
    await verificar(tela.replace(empreendimento, '/empreendimentos/[id]'))
  }
  await page.goto(`${empreendimento}/carteira`)
  await page
    .getByRole('link', { name: /Quadra A · Lote 1/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quadra A · Lote 1')
  await verificar('contrato')

  expect(problemas, problemas.join('\n')).toEqual([])
})
