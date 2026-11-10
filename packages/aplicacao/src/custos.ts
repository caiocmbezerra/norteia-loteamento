import type { ClienteBanco } from '@norteia/db'
import { premissasParaMotor } from '@norteia/dominio'
import {
  Decimal,
  type Lancamento,
  type ResumoViabilidade,
  projetarViabilidade,
  resumirViabilidade,
} from '@norteia/motor-financeiro'
import {
  type ItemOrcamento,
  type ProjecaoCustos,
  orcamentoDoPlano,
  projetarAtual,
  projetarCustos,
} from '@norteia/projecao'
import { vendasDoEmpreendimento } from './comercial'
import { permutasFinanceiras } from './permutas'
import { ErroAplicacao, traduzirErroBanco } from './erros'

export interface PainelCustos {
  dataBase: string
  /** 'revisado' = itens do orçamento do empreendimento; 'plano' = custos do plano vigente. */
  origemOrcamento: 'revisado' | 'plano' | 'nenhum'
  custos: ProjecaoCustos
  plano: ResumoViabilidade | null
  atual: ResumoViabilidade | null
  /** Lançamentos do fluxo atual (mês 0 = mês da data-base), para consolidações. */
  lancamentosAtuais: Lancamento[] | null
  custoPorLote: Decimal | null
  custoPorM2: Decimal | null
  nomesCentros: Record<string, string>
}

function falhar(error: { code?: string; message: string } | null) {
  if (error) throw traduzirErroBanco(error)
}

/**
 * Tudo o que a tela de custos mostra (Fase 3). `hoje` (AAAA-MM-DD) vem de quem chama:
 * a projeção e o motor nunca leem o relógio (RN-F15).
 */
export async function carregarPainelCustos(
  db: ClienteBanco,
  empreendimentoId: string,
  hoje: string,
): Promise<PainelCustos> {
  const [emp, orc, contratos, contas, pagamentos, plano, lotes, centros] = await Promise.all([
    db.from('empreendimentos').select('data_base, tenant_id').eq('id', empreendimentoId).single(),
    db
      .from('orcamento_itens')
      .select('centro_codigo, tipo, valor_centavos, mes_inicio, mes_fim')
      .eq('empreendimento_id', empreendimentoId),
    db
      .from('contratos_fornecedor')
      .select('id, centro_codigo, valor_centavos, data_inicio, data_fim_prevista, situacao')
      .eq('empreendimento_id', empreendimentoId),
    db
      .from('contas_pagar')
      .select('id, centro_codigo, contrato_id, valor_centavos, vencimento, cancelada_em')
      .eq('empreendimento_id', empreendimentoId),
    db
      .from('pagamentos')
      .select(
        'conta_id, data_pagamento, valor_centavos, estornado_em, contas_pagar!inner(empreendimento_id)',
      )
      .eq('contas_pagar.empreendimento_id', empreendimentoId),
    db
      .from('plano_versoes')
      .select('premissas, tma_mensal')
      .eq('empreendimento_id', empreendimentoId)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('lotes').select('status, area_m2').eq('empreendimento_id', empreendimentoId),
    db.from('centros_custo').select('codigo, nome'),
  ])
  for (const r of [emp, orc, contratos, contas, pagamentos, plano, lotes, centros]) falhar(r.error)

  const premissas = plano.data ? premissasParaMotor(plano.data.premissas) : null
  const itens: ItemOrcamento[] = (orc.data ?? []).map((i) => ({
    centro: i.centro_codigo,
    tipo: i.tipo as ItemOrcamento['tipo'],
    valorCentavos: i.valor_centavos,
    mesInicio: i.mes_inicio,
    mesFim: i.mes_fim,
  }))
  const origemOrcamento = itens.length ? 'revisado' : premissas ? 'plano' : 'nenhum'
  const orcamento = itens.length ? itens : premissas ? orcamentoDoPlano(premissas) : []

  const custos = projetarCustos({
    dataBase: emp.data!.data_base,
    hoje,
    orcamento,
    contratos: (contratos.data ?? []).map((k) => ({
      id: k.id,
      centro: k.centro_codigo,
      valorCentavos: k.valor_centavos,
      dataInicio: k.data_inicio,
      dataFimPrevista: k.data_fim_prevista,
      situacao: k.situacao as 'vigente' | 'encerrado' | 'cancelado',
    })),
    contas: (contas.data ?? []).map((c) => ({
      id: c.id,
      centro: c.centro_codigo,
      contratoId: c.contrato_id,
      valorCentavos: c.valor_centavos,
      vencimento: c.vencimento,
      cancelada: c.cancelada_em !== null,
    })),
    pagamentos: (pagamentos.data ?? []).map((p) => ({
      contaId: p.conta_id,
      data: p.data_pagamento,
      valorCentavos: p.valor_centavos,
      estornado: p.estornado_em !== null,
    })),
  })

  let resumoPlano: ResumoViabilidade | null = null
  let resumoAtual: ResumoViabilidade | null = null
  let lancamentosAtuais: Lancamento[] | null = null
  if (premissas && plano.data) {
    const tma = { base: premissas.base, mensal: new Decimal(String(plano.data.tma_mensal)) }
    resumoPlano = resumirViabilidade(projetarViabilidade(premissas), tma)
    const [vendas, permutas] = await Promise.all([
      vendasDoEmpreendimento(db, empreendimentoId),
      permutasFinanceiras(db, empreendimentoId),
    ])
    const atual = projetarAtual(premissas, custos, {
      dataBase: emp.data!.data_base,
      hoje,
      vendas,
      permutas,
    })
    lancamentosAtuais = atual.lancamentos
    resumoAtual = resumirViabilidade(atual, tma)
  }

  const listaLotes = lotes.data ?? []
  const area = listaLotes.reduce((s, l) => s.plus(String(l.area_m2)), new Decimal(0))
  // Custo do empreendimento (terreno, aprovação, obra, marketing, administração), sem comissões.
  const custoTotal = custos.total.custoFinal
  return {
    dataBase: emp.data!.data_base,
    origemOrcamento,
    custos,
    plano: resumoPlano,
    atual: resumoAtual,
    lancamentosAtuais,
    custoPorLote: listaLotes.length ? custoTotal.div(listaLotes.length) : null,
    custoPorM2: area.isZero() ? null : custoTotal.div(area),
    nomesCentros: Object.fromEntries((centros.data ?? []).map((c) => [c.codigo, c.nome])),
  }
}

/** Copia os custos do plano vigente para o orçamento revisado, que passa a ser editável. */
export async function criarOrcamentoDoPlano(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
) {
  const { data: plano, error } = await db
    .from('plano_versoes')
    .select('premissas')
    .eq('empreendimento_id', empreendimentoId)
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  falhar(error)
  if (!plano)
    throw new ErroAplicacao(
      'Aprove um plano de viabilidade antes de revisar o orçamento.',
      'sem_plano',
    )
  const p = premissasParaMotor(plano.premissas)
  const { error: e2 } = await db.from('orcamento_itens').insert(
    p.custos.map((c) => ({
      tenant_id: tenantId,
      empreendimento_id: empreendimentoId,
      centro_codigo: c.centroCusto,
      descricao: c.descricao,
      tipo: c.tipo,
      valor_centavos: Number(c.valorCentavos),
      mes_inicio: c.mesInicio,
      mes_fim: c.mesFim,
    })),
  )
  falhar(e2)
}

export interface NovoContrato {
  fornecedorId: string
  centro: string
  descricao: string
  valorCentavos: number
  dataInicio: string
  dataFimPrevista: string
}

export async function registrarContrato(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  c: NovoContrato,
) {
  const { error } = await db.from('contratos_fornecedor').insert({
    tenant_id: tenantId,
    empreendimento_id: empreendimentoId,
    fornecedor_id: c.fornecedorId,
    centro_codigo: c.centro,
    descricao: c.descricao,
    valor_centavos: c.valorCentavos,
    data_inicio: c.dataInicio,
    data_fim_prevista: c.dataFimPrevista,
  })
  falhar(error)
}

export interface NovaConta {
  centro: string
  contratoId: string | null
  fornecedorId: string | null
  descricao: string
  valorCentavos: number
  vencimento: string
  documentoNumero: string | null
}

export async function registrarConta(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  c: NovaConta,
) {
  let centro = c.centro
  if (c.contratoId) {
    const { data, error } = await db
      .from('contratos_fornecedor')
      .select('centro_codigo')
      .eq('id', c.contratoId)
      .single()
    falhar(error)
    centro = data!.centro_codigo
  }
  const { data, error } = await db
    .from('contas_pagar')
    .insert({
      tenant_id: tenantId,
      empreendimento_id: empreendimentoId,
      centro_codigo: centro,
      contrato_id: c.contratoId,
      fornecedor_id: c.contratoId ? null : c.fornecedorId,
      descricao: c.descricao,
      valor_centavos: c.valorCentavos,
      vencimento: c.vencimento,
      documento_numero: c.documentoNumero,
    })
    .select('id')
    .single()
  falhar(error)
  return data!.id
}

const TIPOS_ANEXO = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const LIMITE_ANEXO = 10 * 1024 * 1024

/** Guarda a nota, boleto ou recibo no Storage e liga à conta a pagar. */
export async function anexarDocumentoConta(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  contaId: string,
  arquivo: { nome: string; tipo: string; bytes: Blob | ArrayBuffer; tamanho: number },
) {
  if (!TIPOS_ANEXO.includes(arquivo.tipo))
    throw new ErroAplicacao('Anexe um PDF ou uma imagem (PNG, JPG ou WebP).', 'anexo', 'anexo')
  if (arquivo.tamanho > LIMITE_ANEXO)
    throw new ErroAplicacao('O anexo pode ter até 10 MB.', 'anexo', 'anexo')
  const nome = arquivo.nome.replace(/[^\w.-]+/g, '_').slice(-120) || 'documento'
  const caminho = `${tenantId}/${empreendimentoId}/contas/${contaId}/${crypto.randomUUID()}-${nome}`
  const envio = await db.storage
    .from('documentos')
    .upload(caminho, arquivo.bytes, { contentType: arquivo.tipo })
  if (envio.error) throw new ErroAplicacao('Não foi possível guardar o anexo. Tente de novo.')
  const { error } = await db.from('anexos_conta').insert({
    tenant_id: tenantId,
    empreendimento_id: empreendimentoId,
    conta_id: contaId,
    caminho,
    nome: arquivo.nome.slice(0, 200) || nome,
    tipo: arquivo.tipo,
    tamanho: arquivo.tamanho,
  })
  if (error) {
    await db.storage.from('documentos').remove([caminho])
    falhar(error)
  }
}

export async function registrarPagamento(
  db: ClienteBanco,
  tenantId: string,
  contaId: string,
  data: string,
  valorCentavos: number,
) {
  const { error } = await db.from('pagamentos').insert({
    tenant_id: tenantId,
    conta_id: contaId,
    data_pagamento: data,
    valor_centavos: valorCentavos,
  })
  falhar(error)
}

export async function estornarPagamento(db: ClienteBanco, pagamentoId: string, motivo: string) {
  if (motivo.trim().length < 3)
    throw new ErroAplicacao('Informe o motivo do estorno.', 'motivo', 'motivo')
  const { data, error } = await db
    .from('pagamentos')
    .update({ estornado_em: new Date().toISOString(), motivo_estorno: motivo.trim() })
    .eq('id', pagamentoId)
    .is('estornado_em', null)
    .select('id')
  falhar(error)
  if (!data?.length) throw new ErroAplicacao('Pagamento não encontrado ou já estornado.')
}

/** Registra a medição pelo percentual acumulado; o banco calcula o valor e cria a conta. */
export async function registrarMedicao(
  db: ClienteBanco,
  m: {
    contratoId: string
    data: string
    percentualAcumulado: string
    vencimento: string
    documento: string | null
    observacao: string | null
  },
): Promise<string> {
  const { data, error } = await db.rpc('registrar_medicao', {
    p_contrato: m.contratoId,
    p_data: m.data,
    p_percentual_acumulado: Number(m.percentualAcumulado),
    p_vencimento: m.vencimento,
    ...(m.documento ? { p_documento: m.documento } : {}),
    ...(m.observacao ? { p_observacao: m.observacao } : {}),
  })
  falhar(error)
  return data!
}

export type CriterioRateio = 'lotes' | 'area' | 'vgv' | 'manual'

/** Divide uma despesa comum entre empreendimentos; cada parte vira uma conta a pagar. */
export async function ratearDespesa(
  db: ClienteBanco,
  r: {
    descricao: string
    centro: string
    fornecedorId: string | null
    valorCentavos: number
    vencimento: string
    documentoNumero: string | null
    criterio: CriterioRateio
    empreendimentos: string[]
    /** Só no critério manual: fração por empreendimento (somando 1). */
    percentuais?: Record<string, string>
  },
): Promise<string> {
  const { data, error } = await db.rpc('ratear_despesa', {
    p_rateio: {
      descricao: r.descricao,
      centro_codigo: r.centro,
      fornecedor_id: r.fornecedorId,
      valor_centavos: r.valorCentavos,
      vencimento: r.vencimento,
      documento_numero: r.documentoNumero,
      criterio: r.criterio,
    },
    p_empreendimentos: r.empreendimentos,
    ...(r.percentuais ? { p_percentuais: r.percentuais } : {}),
  })
  falhar(error)
  return data!
}
