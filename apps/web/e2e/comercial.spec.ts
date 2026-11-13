import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Fase 4: reserva → venda em até 3 telas no celular, bloqueio antes do registro (RN-C01)
// e trava contra venda duplicada sob concorrência (RN-C02).
test('reserva, simulação e venda de um lote', async ({ page }, info) => {
  await page.goto('/cadastrar')
  await page.getByLabel('Seu nome').fill('Gabi Gestora')
  await page.getByLabel('E-mail').fill(`venda.${Date.now()}.${info.project.name}@exemplo.com.br`)
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-123')
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByLabel('Nome da sua loteadora').fill('Loteadora Vendas')
  await page.getByLabel('Nome do empreendimento').fill('Jardim Comercial')
  await page.getByLabel('Município').fill('Goiânia')
  await page.getByLabel('UF').selectOption('GO')
  await page.getByLabel('Lotes por quadra').fill('3')
  await page.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await page.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jardim Comercial')
  const empreendimento = page.url().split('?')[0]!

  // Corretor com comissão de 5% no ato
  await page.goto('/configuracoes/corretores')
  await page.getByLabel('Nome do corretor').fill('Rui Corretor')
  await page.getByRole('button', { name: 'Cadastrar corretor' }).click()
  await expect(page.getByText(/comissão 5,0% no ato/)).toBeVisible()

  // Tela 1 → 2: grade → lote → reservar
  await page.goto(empreendimento)
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByLabel('Nome do cliente').fill('Joana Compradora')
  await page.getByLabel('Corretor').selectOption({ label: 'Rui Corretor' })
  await page.getByRole('button', { name: 'Reservar lote' }).click()
  await expect(page.getByText(/Reservado para Joana Compradora por Rui Corretor/)).toBeVisible()

  // Tela 3: venda com simulador — bloqueada sem registro
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Joana Compradora')
  await page.getByLabel('CPF').fill('529.982.247-25')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await expect(page.getByText('120 × R$ 899,27')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByRole('alert').first()).toContainText(
    'o loteamento ainda não foi registrado',
  )

  // Registra o loteamento e vende
  await page.goto(`${empreendimento}/editar`)
  await page.getByLabel('Situação').selectOption('em_vendas')
  await page.getByLabel('Data do registro').fill('2026-10-01')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await page.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await page.getByRole('link', { name: 'Registrar venda' }).click()
  await page.getByLabel('Nome completo').fill('Joana Compradora')
  await page.getByLabel('CPF').fill('529.982.247-25')
  await page.getByLabel('Entrada (R$)').fill('9.000,00')
  await expect(page.getByLabel('Corretor')).toHaveValue(/.+/)
  await page.getByRole('button', { name: 'Registrar venda' }).click()
  await expect(page.getByText(/Venda registrada com o contrato/)).toBeVisible()
  await expect(page.getByText('Joana Compradora')).toBeVisible()

  // Painel comercial
  await page.goto(`${empreendimento}/comercial`)
  const resumo = page.getByRole('region', { name: 'Resumo comercial' })
  await expect(resumo).toContainText(/Lotes vendidos\s*1/)
  await expect(resumo).toContainText(/VGV vendido\s*R\$\s90\.000,00/)
  await expect(page.getByRole('row', { name: /Rui Corretor/ })).toContainText(/R\$\s4\.500,00/)
})

function envLocal(): Record<string, string> {
  const arquivo = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
  return Object.fromEntries(
    arquivo
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const [k, ...v] = l.split('=')
        return [k!.trim(), v.join('=').trim().replace(/^"|"$/g, '')]
      }),
  )
}

// O Playwright exige o primeiro parâmetro desestruturado, mesmo sem fixtures.
// eslint-disable-next-line no-empty-pattern
test('50 reservas simultâneas do mesmo lote: exatamente 1 vence (RN-C02)', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'teste de banco: roda uma vez')
  const env = { ...envLocal(), ...process.env }
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false },
    },
  )
  const { error: e1 } = await db.auth.signUp({
    email: `concorrencia.${Date.now()}@exemplo.com.br`,
    password: 'senha-forte-123',
  })
  expect(e1).toBeNull()
  const { data: tenant } = await db.rpc('criar_tenant', { p_nome: 'Concorrência' })
  const { data: spe } = await db.from('spes').select('id').eq('tenant_id', tenant!).single()
  const { data: emp } = await db.rpc('criar_empreendimento_com_lotes', {
    p_tenant: tenant!,
    p_spe: spe!.id,
    p_nome: 'Disputado',
    p_municipio: 'Goiânia',
    p_uf: 'GO',
    p_data_base: '2026-01-01',
    p_lotes: [{ quadra: 'A', numero: '1', area_m2: '300' }],
  })
  const { data: lote } = await db.from('lotes').select('id').eq('empreendimento_id', emp!).single()

  const tentativas = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      db.rpc('reservar_lote', { p_lote: lote!.id, p_cliente_nome: `Cliente ${i}` }),
    ),
  )
  const sucessos = tentativas.filter((t) => !t.error)
  expect(sucessos).toHaveLength(1)
  expect(tentativas.filter((t) => t.error?.message.includes('não está disponível'))).toHaveLength(
    49,
  )
  const { count } = await db
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('lote_id', lote!.id)
  expect(count).toBe(1)
})
