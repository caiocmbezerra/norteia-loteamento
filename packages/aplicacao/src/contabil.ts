import type { ClienteBanco } from '@norteia/db'
import {
  type EventoContabil,
  EVENTOS_CONTABEIS,
  type FatoContabil,
  FORMATO_PADRAO,
  type FormatoContabil,
  type LancamentoContabil,
  type MesCaixaCompetencia,
  type RegraContabil,
  arquivoContabil,
  caixaCompetencia,
  lancamentosContabeis,
} from '@norteia/integracoes'
import { ErroAplicacao, traduzirErroBanco } from './erros'

export { EVENTOS_CONTABEIS, type EventoContabil, type FormatoContabil }

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface ConfigContabil {
  contas: { codigo: string; nome: string }[]
  regras: RegraContabil[]
  formato: FormatoContabil
}

export async function carregarConfigContabil(
  db: ClienteBanco,
  tenantId: string,
): Promise<ConfigContabil> {
  const [contas, regras, formato] = await Promise.all([
    db.from('plano_contas').select('codigo, nome').eq('tenant_id', tenantId).order('codigo'),
    db
      .from('regras_contabeis')
      .select('evento, conta_debito, conta_credito, historico')
      .eq('tenant_id', tenantId),
    db
      .from('formatos_contabeis')
      .select('separador, decimal, formato_data, colunas, cabecalho')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ])
  for (const r of [contas, regras, formato]) falhar(r.error)
  const f = formato.data
  return {
    contas: contas.data ?? [],
    regras: (regras.data ?? []).map((r) => ({
      evento: r.evento as EventoContabil,
      contaDebito: r.conta_debito,
      contaCredito: r.conta_credito,
      historico: r.historico,
    })),
    formato: f
      ? {
          separador: f.separador as FormatoContabil['separador'],
          decimal: f.decimal as FormatoContabil['decimal'],
          formatoData: f.formato_data as FormatoContabil['formatoData'],
          colunas: f.colunas as FormatoContabil['colunas'],
          cabecalho: f.cabecalho,
        }
      : FORMATO_PADRAO,
  }
}

/** Inclui ou atualiza contas a partir de linhas "código;nome" (colado do plano do contador). */
export async function importarContas(
  db: ClienteBanco,
  tenantId: string,
  texto: string,
): Promise<number> {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const contas = linhas.map((l, i) => {
    const [codigo, ...resto] = l.split(/[;\t]/)
    const nome = resto.join(' ').trim()
    if (!codigo?.trim() || !nome)
      throw new ErroAplicacao(`Linha ${i + 1}: use "código;nome".`, 'validacao', 'contas')
    return { tenant_id: tenantId, codigo: codigo.trim(), nome }
  })
  if (contas.length === 0)
    throw new ErroAplicacao('Cole ao menos uma conta.', 'validacao', 'contas')
  const { error } = await db.from('plano_contas').upsert(contas, { onConflict: 'tenant_id,codigo' })
  falhar(error)
  return contas.length
}

export async function salvarRegraContabil(db: ClienteBanco, tenantId: string, r: RegraContabil) {
  const { error } = await db.from('regras_contabeis').upsert(
    {
      tenant_id: tenantId,
      evento: r.evento,
      conta_debito: r.contaDebito,
      conta_credito: r.contaCredito,
      historico: r.historico || '{descricao}',
    },
    { onConflict: 'tenant_id,evento' },
  )
  if (error?.code === '23503')
    throw new ErroAplicacao('Use contas do plano de contas.', 'validacao', 'conta_debito')
  falhar(error)
}

export async function excluirRegraContabil(
  db: ClienteBanco,
  tenantId: string,
  evento: EventoContabil,
) {
  const { error } = await db
    .from('regras_contabeis')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('evento', evento)
  falhar(error)
}

export async function salvarFormatoContabil(
  db: ClienteBanco,
  tenantId: string,
  f: FormatoContabil,
) {
  const { error } = await db.from('formatos_contabeis').upsert({
    tenant_id: tenantId,
    separador: f.separador,
    decimal: f.decimal,
    formato_data: f.formatoData,
    colunas: f.colunas,
    cabecalho: f.cabecalho,
  })
  falhar(error)
}

export interface PainelContabil {
  mensal: MesCaixaCompetencia[]
  lancamentos: LancamentoContabil[]
  semRegra: { evento: EventoContabil; nome: string; quantidade: number }[]
  totalEventos: number
}

async function fatos(
  db: ClienteBanco,
  speId: string,
  inicio: string,
  fim: string,
): Promise<FatoContabil[] | null> {
  const { data, error } = await db.rpc('eventos_contabeis', {
    p_spe: speId,
    p_inicio: inicio,
    p_fim: fim,
  })
  if (error?.code === '42501') return null
  falhar(error)
  return data as unknown as FatoContabil[]
}

/** Caixa × competência, lançamentos pelas regras do cliente e eventos ainda sem regra. */
export async function carregarContabilSpe(
  db: ClienteBanco,
  tenantId: string,
  speId: string,
  inicio: string,
  fim: string,
): Promise<PainelContabil | null> {
  const [f, config] = await Promise.all([
    fatos(db, speId, inicio, fim),
    carregarConfigContabil(db, tenantId),
  ])
  if (!f) return null
  const { lancamentos, semRegra } = lancamentosContabeis(f, config.regras)
  return {
    mensal: caixaCompetencia(f),
    lancamentos,
    semRegra: semRegra.map((s) => ({ ...s, nome: EVENTOS_CONTABEIS[s.evento] })),
    totalEventos: f.length,
  }
}

export async function arquivoContabilSpe(
  db: ClienteBanco,
  tenantId: string,
  speId: string,
  inicio: string,
  fim: string,
): Promise<{ nome: string; conteudo: string }> {
  const [f, config] = await Promise.all([
    fatos(db, speId, inicio, fim),
    carregarConfigContabil(db, tenantId),
  ])
  if (!f) throw new ErroAplicacao('Sem permissão para a exportação contábil desta SPE.')
  const { lancamentos, semRegra } = lancamentosContabeis(f, config.regras)
  if (semRegra.length > 0)
    throw new ErroAplicacao(
      `Configure as contas de: ${semRegra.map((s) => EVENTOS_CONTABEIS[s.evento]).join(', ')}.`,
    )
  return {
    nome: `lancamentos-${inicio}-a-${fim}.csv`,
    conteudo: arquivoContabil(lancamentos, config.formato),
  }
}
