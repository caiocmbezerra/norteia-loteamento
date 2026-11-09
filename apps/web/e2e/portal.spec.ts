import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import PizZip from 'pizzip'

const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function dia(deslocamento: number) {
  const d = new Date(Date.now() + deslocamento * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

/**
 * Simula o Asaas conectado e um boleto já emitido para a próxima parcela (sem rede no teste):
 * o portal devolve o link pendente em vez de chamar o Asaas.
 */
function simularBoletoPendente(loteadora: string) {
  const sql = `
    set app.carteira = 'on';
    with t as (select id from public.tenants where nome = '${loteadora}')
    insert into public.integracoes_asaas (tenant_id, ambiente, segredo_id, webhook_token_hash)
    select id, 'sandbox', gen_random_uuid(), 'teste' from t;
    insert into public.cobrancas (tenant_id, parcela_id, asaas_id, valor_centavos, vencimento, link_fatura)
    select p.tenant_id, p.id, 'pay_teste_' || p.id, p.valor_centavos - p.pago_centavos, p.vencimento,
           'https://asaas.teste/i/' || p.id
      from public.parcelas p join public.tenants t on t.id = p.tenant_id
     where t.nome = '${loteadora}' and p.situacao = 'aberta'
     order by p.numero limit 1;`
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql])
}

// Fase 7a: a loteadora convida o comprador; ele aceita, vê o contrato e chega à segunda via
// do boleto em até 3 toques depois de entrar.
test('comprador aceita o convite e abre a segunda via em até 3 toques', async ({
  browser,
}, info) => {
  const sufixo = `${Date.now()}.${info.project.name}`
  const loteadora = `Loteadora Portal ${sufixo}`
  const emailComprador = `paulo.${sufixo}@exemplo.com.br`
  const dona = await (await browser.newContext()).newPage()

  await dona.goto('/cadastrar')
  await dona.getByLabel('Seu nome').fill('Dora Dona')
  await dona.getByLabel('E-mail').fill(`dona.portal.${sufixo}@exemplo.com.br`)
  await dona.getByLabel('Senha').fill('senha-forte-123')
  await dona.getByRole('button', { name: 'Criar conta' }).click()
  await dona.getByLabel('Nome da sua loteadora').fill(loteadora)
  await dona.getByLabel('Nome do empreendimento').fill('Jardim Portal')
  await dona.getByLabel('Município').fill('Goiânia')
  await dona.getByLabel('UF').selectOption('GO')
  await dona.getByLabel('Lotes por quadra').fill('1')
  await dona.getByLabel('Preço de cada lote (R$)').fill('90.000,00')
  await dona.getByRole('button', { name: 'Criar meu loteamento' }).click()
  await expect(dona.getByRole('heading', { level: 1 })).toHaveText('Jardim Portal')
  const empreendimento = dona.url().split('?')[0]!
  await dona.goto(`${empreendimento}/editar`)
  await dona.getByLabel('Situação').selectOption('em_vendas')
  await dona.getByLabel('Data do registro').fill('2026-01-02')
  await dona.getByRole('button', { name: 'Salvar' }).click()

  await dona.getByRole('link', { name: /Quadra A, lote 1:/ }).click()
  await dona.getByRole('link', { name: 'Registrar venda' }).click()
  await dona.getByLabel('Nome completo').fill('Paulo Comprador')
  await dona.getByLabel('E-mail').fill(emailComprador)
  await dona.getByLabel('Entrada (R$)').fill('9.000,00')
  await dona.getByLabel('Parcelas').fill('3')
  await dona.getByLabel('Juros ao mês (%)').fill('0')
  await dona.getByLabel('Data da venda').fill(dia(-10))
  await dona.getByLabel('1ª parcela').fill(dia(20))
  await dona.getByRole('button', { name: 'Registrar venda' }).click()
  await dona.getByRole('link', { name: 'Ver parcelas' }).click()
  // Entrada paga na data da venda.
  await dona.getByLabel('Data do pagamento').fill(dia(-10))
  await dona.getByRole('button', { name: 'Registrar recebimento' }).click()
  await expect(dona.getByText('Recebimento registrado.')).toBeVisible()
  const ano = dia(-10).slice(0, 4)
  await expect(dona.getByRole('link', { name: `Informe de pagamentos ${ano}` })).toBeVisible()

  // Convite: o e-mail do comprador já vem preenchido.
  await expect(dona.getByLabel('E-mail para o portal')).toHaveValue(emailComprador)
  await dona.getByRole('button', { name: 'Gerar convite para o portal' }).click()
  const link = await dona.getByLabel('Link do convite para o portal').inputValue()
  expect(link).toMatch(/\/portal-convite\/[0-9a-f]{48}$/)
  simularBoletoPendente(loteadora)

  // Comprador cria a conta pelo link e aceita.
  const comprador = await (await browser.newContext()).newPage()
  await comprador.route('https://asaas.teste/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<h1>Fatura Asaas</h1>' }),
  )
  const caminho = new URL(link).pathname
  await comprador.goto(caminho)
  await comprador.getByRole('link', { name: 'Criar conta' }).click()
  await comprador.getByLabel('Seu nome').fill('Paulo Comprador')
  await comprador.getByLabel('E-mail').fill(emailComprador)
  await comprador.getByLabel('Senha').fill('senha-forte-123')
  await comprador.getByRole('button', { name: 'Criar conta' }).click()
  await expect(comprador).toHaveURL(new RegExp(`${caminho}$`))
  await comprador.getByRole('button', { name: 'Abrir meu portal' }).click()

  await expect(comprador.getByRole('heading', { name: 'Olá, Paulo' })).toBeVisible()
  await expect(comprador.getByText('Quadra A · Lote 1')).toBeVisible()
  await expect(comprador.getByText(/Saldo a pagar\s*R\$\s81\.000,00/)).toBeVisible()

  // Parcelas e informe de pagamentos.
  await comprador.getByRole('link', { name: 'Parcelas e pagamentos' }).click()
  await expect(comprador.getByText('Entrada · ')).toBeVisible()
  await expect(comprador.getByRole('button', { name: 'Abrir boleto/Pix' })).toHaveCount(1)
  // Cópia do contrato, no modelo padrão.
  const [contrato] = await Promise.all([
    comprador.waitForEvent('download'),
    comprador.getByRole('link', { name: 'Contrato', exact: true }).click(),
  ])
  const xmlContrato = new PizZip(readFileSync((await contrato.path())!))
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '')
  expect(xmlContrato).toContain('Paulo Comprador')
  expect(xmlContrato).toMatch(/PREÇO: R\$\s90\.000,00/)

  // Informe de IR do ano, no modelo padrão.
  const [download] = await Promise.all([
    comprador.waitForEvent('download'),
    comprador.getByRole('link', { name: `Baixar informe ${ano}` }).click(),
  ])
  const xml = new PizZip(readFileSync((await download.path())!)).file('word/document.xml')!.asText()
  const texto = xml.replace(/<[^>]+>/g, '')
  expect(texto).toContain('Paulo Comprador')
  expect(texto).toMatch(new RegExp(`Total pago em ${ano}: R\\$\\s9\\.000,00`))

  // Sai e volta: entrar (toque 1, 2 com o envio) leva direto ao portal; segunda via é o 3º toque.
  await comprador.getByRole('button', { name: 'Sair' }).click()
  await comprador.goto('/entrar')
  await comprador.getByLabel('E-mail').fill(emailComprador)
  await comprador.getByLabel('Senha').fill('senha-forte-123')
  await comprador.getByRole('button', { name: 'Entrar' }).click()
  await expect(comprador).toHaveURL(/\/portal$/)
  await comprador.getByRole('button', { name: 'Segunda via do boleto' }).click()
  await expect(comprador).toHaveURL(/^https:\/\/asaas\.teste\/i\//)
  await expect(comprador.getByRole('heading', { name: 'Fatura Asaas' })).toBeVisible()

  // O comprador não enxerga a gestão.
  await comprador.goto(empreendimento)
  await expect(comprador).toHaveURL(/\/portal$/)

  // Na gestão, o convite aparece como aceito.
  await dona.reload()
  await expect(dona.getByText(/O comprador já acessa o portal/)).toBeVisible()
})
