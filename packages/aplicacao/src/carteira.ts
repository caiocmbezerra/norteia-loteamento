import type { ClienteBanco } from '@norteia/db'
import {
  Decimal,
  type Encargos,
  type RegraEncargos,
  calcularEncargos,
  centavos,
  descontoAntecipacao,
  diasEntre,
  gerarParcelasContrato,
} from '@norteia/motor-financeiro'
import type { ParcelaReal } from '@norteia/projecao'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }

function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

const PAGINA = 1000

/** Lê todas as linhas de uma consulta, em páginas (o PostgREST limita cada resposta). */
export async function paginar<T>(
  buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: ErroBanco | null }>,
): Promise<T[]> {
  const linhas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await buscar(de, de + PAGINA - 1)
    falhar(error)
    linhas.push(...(data ?? []))
    if ((data ?? []).length < PAGINA) return linhas
  }
}

export const INDICES_REAJUSTE = ['IPCA', 'IGP-M', 'INCC'] as const
export type IndiceReajuste = (typeof INDICES_REAJUSTE)[number]

/** Gera o contrato da venda com as parcelas calculadas pelo motor (RN-K01, RN-K02). */
export async function gerarContrato(
  db: ClienteBanco,
  vendaId: string,
  indice: IndiceReajuste | null,
): Promise<string> {
  const { data: v, error } = await db
    .from('vendas')
    .select(
      'data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em',
    )
    .eq('id', vendaId)
    .single()
  falhar(error)
  const parcelas = gerarParcelasContrato({
    precoCentavos: centavos(v!.preco_centavos),
    entradaCentavos: centavos(v!.entrada_centavos),
    dataEntrada: v!.data_venda,
    parcelas: v!.parcelas,
    jurosMensal: new Decimal(String(v!.juros_mensal)),
    sistema: v!.sistema as 'price' | 'sac',
    primeiraParcelaEm: v!.primeira_parcela_em,
  })
  const { data, error: erroContrato } = await db.rpc('criar_contrato', {
    p_venda: vendaId,
    p_parcelas: parcelas.map((p) => ({
      numero: p.numero,
      vencimento: p.vencimento,
      valor_centavos: p.valor,
      amortizacao_centavos: p.amortizacao,
      juros_centavos: p.juros,
    })),
    ...(indice ? { p_indice: indice } : {}),
  })
  falhar(erroContrato)
  return data!
}

export interface RecebimentoContrato {
  id: string
  data: string
  valorCentavos: number
  principalCentavos: number
  multaCentavos: number
  jurosMoraCentavos: number
  descontoCentavos: number
  origem: string
  observacao: string | null
  estornado: boolean
  motivoEstorno: string | null
}

export interface ParcelaContratoDetalhe {
  id: string
  numero: number
  vencimento: string
  valorCentavos: number
  amortizacaoCentavos: number
  jurosCentavos: number
  correcaoCentavos: number
  pagoCentavos: number
  saldoCentavos: number
  situacao: 'aberta' | 'paga' | 'cancelada'
  /** Encargos se o saldo for pago hoje (RN-K04). */
  encargosHoje: Encargos
  recebimentos: RecebimentoContrato[]
  /** Cobrança do Asaas mais relevante: a pendente, senão a última divergente. */
  cobranca: {
    id: string
    situacao: 'pendente' | 'paga' | 'cancelada' | 'divergente'
    vencimento: string
    valorCentavos: number
    linkFatura: string | null
    motivo: string | null
  } | null
}

export interface ContratoDetalhe {
  id: string
  empreendimentoId: string
  empreendimentoNome: string
  vendaId: string
  loteId: string
  lote: string
  comprador: string | null
  indiceReajuste: string | null
  regra: RegraEncargos
  regrasReajuste: { periodicidadeMeses: number; defasagemMeses: number; negativo: string }
  reajustes: {
    aniversario: string
    indice: string
    competenciaInicial: string
    competenciaFinal: string
    fator: string
    fatorAplicado: string
    parcelas: number
    diferencaCentavos: number
  }[]
  situacao: string
  quitadoEm: string | null
  /** Juros e sistema da venda (taxa usada na antecipação e sugerida na renegociação). */
  jurosMensal: string
  sistema: 'price' | 'sac'
  aditivos: {
    id: string
    data: string
    motivo: string
    saldoAnteriorCentavos: number
    encargosCentavos: number
    descontoCentavos: number
    novoSaldoCentavos: number
    parcelasAnteriores: number
  }[]
  /** Integração com o Asaas ativa para emitir boleto/Pix. */
  asaasAtivo: boolean
  parcelas: ParcelaContratoDetalhe[]
  totais: {
    valorCentavos: number
    recebidoCentavos: number
    saldoCentavos: number
    vencidoCentavos: number
    encargosHojeCentavos: number
  }
}

function regraDe(c: { multa_atraso: number; juros_mora_mensal: number }): RegraEncargos {
  return {
    multa: new Decimal(String(c.multa_atraso)),
    jurosMoraMensal: new Decimal(String(c.juros_mora_mensal)),
  }
}

/** Contrato com parcelas, recebimentos e encargos calculados para a data informada. */
export async function carregarContrato(
  db: ClienteBanco,
  contratoId: string,
  hoje: string,
): Promise<ContratoDetalhe | null> {
  const { data: c, error } = await db
    .from('contratos')
    .select(
      'id, tenant_id, empreendimento_id, venda_id, lote_id, indice_reajuste, multa_atraso, juros_mora_mensal, reajuste_periodicidade_meses, reajuste_defasagem_meses, reajuste_negativo, situacao, quitado_em, empreendimentos(nome), lotes(numero, quadras(codigo)), compradores(nome), reajustes(aniversario, indice, competencia_inicial, competencia_final, fator, fator_aplicado, parcelas, diferenca_centavos), vendas(juros_mensal, sistema), aditivos(id, data, motivo, saldo_anterior_centavos, encargos_incorporados_centavos, desconto_centavos, novo_saldo_centavos, parcelas_anteriores)',
    )
    .eq('id', contratoId)
    .maybeSingle()
  falhar(error)
  if (!c) return null
  const [parcelas, recebimentos, cobrancas, integracao] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('parcelas')
        .select(
          'id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos, correcao_centavos, pago_centavos, situacao',
        )
        .eq('contrato_id', contratoId)
        .order('numero')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('recebimentos')
        .select(
          'id, parcela_id, data_pagamento, valor_centavos, principal_centavos, multa_centavos, juros_mora_centavos, desconto_centavos, origem, observacao, estornado_em, motivo_estorno, parcelas!inner(contrato_id)',
        )
        .eq('parcelas.contrato_id', contratoId)
        .order('data_pagamento')
        .order('criado_em')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('cobrancas')
        .select(
          'id, parcela_id, situacao, vencimento, valor_centavos, link_fatura, motivo, criado_em, parcelas!inner(contrato_id)',
        )
        .eq('parcelas.contrato_id', contratoId)
        .order('criado_em')
        .range(de, ate),
    ),
    db.from('integracoes_asaas').select('ativo').eq('tenant_id', c.tenant_id).maybeSingle(),
  ])
  const regra = regraDe(c)
  const lista: ParcelaContratoDetalhe[] = parcelas.map((p) => {
    const saldo = p.situacao === 'cancelada' ? 0 : p.valor_centavos - p.pago_centavos
    return {
      id: p.id,
      numero: p.numero,
      vencimento: p.vencimento,
      valorCentavos: p.valor_centavos,
      amortizacaoCentavos: p.amortizacao_centavos,
      jurosCentavos: p.juros_centavos,
      correcaoCentavos: p.correcao_centavos,
      pagoCentavos: p.pago_centavos,
      saldoCentavos: saldo,
      situacao: p.situacao as ParcelaContratoDetalhe['situacao'],
      encargosHoje: calcularEncargos(centavos(saldo), p.vencimento, hoje, regra),
      cobranca: (() => {
        const daParcela = cobrancas.filter((x) => x.parcela_id === p.id)
        const escolhida =
          daParcela.find((x) => x.situacao === 'pendente') ??
          daParcela.filter((x) => x.situacao === 'divergente').at(-1)
        return escolhida
          ? {
              id: escolhida.id,
              situacao: escolhida.situacao as NonNullable<
                ParcelaContratoDetalhe['cobranca']
              >['situacao'],
              vencimento: escolhida.vencimento,
              valorCentavos: escolhida.valor_centavos,
              linkFatura: escolhida.link_fatura,
              motivo: escolhida.motivo,
            }
          : null
      })(),
      recebimentos: recebimentos
        .filter((r) => r.parcela_id === p.id)
        .map((r) => ({
          id: r.id,
          data: r.data_pagamento,
          valorCentavos: r.valor_centavos,
          principalCentavos: r.principal_centavos,
          multaCentavos: r.multa_centavos,
          jurosMoraCentavos: r.juros_mora_centavos,
          descontoCentavos: r.desconto_centavos,
          origem: r.origem,
          observacao: r.observacao,
          estornado: r.estornado_em !== null,
          motivoEstorno: r.motivo_estorno,
        })),
    }
  })
  const soma = (f: (p: ParcelaContratoDetalhe) => number) => lista.reduce((s, p) => s + f(p), 0)
  return {
    id: c.id,
    empreendimentoId: c.empreendimento_id,
    empreendimentoNome: c.empreendimentos?.nome ?? '',
    vendaId: c.venda_id,
    loteId: c.lote_id,
    lote: `Quadra ${c.lotes?.quadras?.codigo ?? '?'} · Lote ${c.lotes?.numero ?? '?'}`,
    comprador: c.compradores?.nome ?? null,
    indiceReajuste: c.indice_reajuste,
    regra,
    regrasReajuste: {
      periodicidadeMeses: c.reajuste_periodicidade_meses,
      defasagemMeses: c.reajuste_defasagem_meses,
      negativo: c.reajuste_negativo,
    },
    reajustes: [...(c.reajustes ?? [])]
      .sort((a, b) => a.aniversario.localeCompare(b.aniversario))
      .map((r) => ({
        aniversario: r.aniversario,
        indice: r.indice,
        competenciaInicial: r.competencia_inicial,
        competenciaFinal: r.competencia_final,
        fator: String(r.fator),
        fatorAplicado: String(r.fator_aplicado),
        parcelas: r.parcelas,
        diferencaCentavos: r.diferenca_centavos,
      })),
    situacao: c.situacao,
    quitadoEm: c.quitado_em,
    asaasAtivo: integracao.data?.ativo ?? false,
    jurosMensal: String(c.vendas?.juros_mensal ?? 0),
    sistema: (c.vendas?.sistema ?? 'price') as 'price' | 'sac',
    aditivos: [...(c.aditivos ?? [])]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((a) => ({
        id: a.id,
        data: a.data,
        motivo: a.motivo,
        saldoAnteriorCentavos: a.saldo_anterior_centavos,
        encargosCentavos: a.encargos_incorporados_centavos,
        descontoCentavos: a.desconto_centavos,
        novoSaldoCentavos: a.novo_saldo_centavos,
        parcelasAnteriores: Array.isArray(a.parcelas_anteriores) ? a.parcelas_anteriores.length : 0,
      })),
    parcelas: lista,
    totais: {
      valorCentavos: soma((p) => (p.situacao === 'cancelada' ? 0 : p.valorCentavos)),
      recebidoCentavos: soma((p) => p.pagoCentavos),
      saldoCentavos: soma((p) => p.saldoCentavos),
      vencidoCentavos: soma((p) => (p.vencimento < hoje ? p.saldoCentavos : 0)),
      encargosHojeCentavos: soma((p) => p.encargosHoje.multa + p.encargosHoje.jurosMora),
    },
  }
}

export interface DadosRecebimento {
  data: string
  principalCentavos: number
  descontoCentavos: number
  observacao: string | null
}

/**
 * Recebimento manual: os encargos sobre o principal pago são calculados pelo motor com a
 * regra do contrato (RN-K04) — o valor informado pelo usuário é só o principal e o desconto.
 */
export async function registrarRecebimento(
  db: ClienteBanco,
  parcelaId: string,
  d: DadosRecebimento,
): Promise<{ id: string; encargos: Encargos }> {
  const { data: p, error } = await db
    .from('parcelas')
    .select('vencimento, contratos(multa_atraso, juros_mora_mensal)')
    .eq('id', parcelaId)
    .single()
  falhar(error)
  if (!p!.contratos) throw new ErroAplicacao('Contrato não encontrado.', 'nao_encontrado')
  if (!Number.isInteger(d.principalCentavos) || d.principalCentavos <= 0)
    throw new ErroAplicacao('Informe o valor recebido.', 'invalido', 'principal')
  const encargos = calcularEncargos(
    centavos(d.principalCentavos),
    p!.vencimento,
    d.data,
    regraDe(p!.contratos),
  )
  if (d.descontoCentavos < 0 || d.descontoCentavos > encargos.total)
    throw new ErroAplicacao('Desconto inválido.', 'invalido', 'desconto')
  const { data, error: erro } = await db.rpc('registrar_recebimento', {
    p_parcela: parcelaId,
    p_data: d.data,
    p_principal: d.principalCentavos,
    p_multa: encargos.multa,
    p_juros_mora: encargos.jurosMora,
    p_desconto: d.descontoCentavos,
    ...(d.observacao ? { p_observacao: d.observacao } : {}),
  })
  falhar(erro)
  return { id: data!, encargos }
}

/** Aplica os reajustes vencidos do contrato (a rotina diária faz o mesmo para todos). */
export async function reajustarContrato(db: ClienteBanco, contratoId: string): Promise<number> {
  const { data, error } = await db.rpc('reajustar_contrato', { p_contrato: contratoId })
  falhar(error)
  return data ?? 0
}

export async function estornarRecebimento(db: ClienteBanco, recebimentoId: string, motivo: string) {
  const { error } = await db.rpc('estornar_recebimento', {
    p_recebimento: recebimentoId,
    p_motivo: motivo,
  })
  falhar(error)
}

export interface ContratoNaCarteira {
  id: string
  lote: string
  comprador: string | null
  situacao: string
  saldoCentavos: number
  vencidoCentavos: number
  parcelasVencidas: number
  /** Dias de atraso da parcela vencida mais antiga. */
  maiorAtraso: number
  proximoVencimento: string | null
}

export interface PainelCarteira {
  contratos: ContratoNaCarteira[]
  /** Vendas ativas ainda sem contrato gerado. */
  vendasSemContrato: { vendaId: string; loteId: string; lote: string; dataVenda: string }[]
  totais: {
    saldoCentavos: number
    vencidoCentavos: number
    recebidoNoMesCentavos: number
    contratosInadimplentes: number
    /** Faixas de atraso (RN-K10 usa na régua de cobrança): até 30, 31–90, acima de 90 dias. */
    faixas: { ate30: number; ate90: number; acima90: number }
  }
}

/** Carteira do empreendimento: saldo, vencido e inadimplência por contrato. */
export async function carregarCarteira(
  db: ClienteBanco,
  empreendimentoId: string,
  hoje: string,
): Promise<PainelCarteira> {
  const inicioMes = `${hoje.slice(0, 7)}-01`
  const [contratos, parcelas, recebidos, vendas] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('contratos')
        .select('id, venda_id, situacao, lotes(numero, quadras(codigo)), compradores(nome)')
        .eq('empreendimento_id', empreendimentoId)
        .order('criado_em')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('parcelas')
        .select(
          'contrato_id, vencimento, valor_centavos, pago_centavos, contratos!inner(empreendimento_id)',
        )
        .eq('contratos.empreendimento_id', empreendimentoId)
        .eq('situacao', 'aberta')
        .order('id')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('recebimentos')
        .select('valor_centavos, parcelas!inner(contratos!inner(empreendimento_id))')
        .eq('parcelas.contratos.empreendimento_id', empreendimentoId)
        .is('estornado_em', null)
        .gte('data_pagamento', inicioMes)
        .order('id')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('vendas')
        .select('id, lote_id, data_venda, lotes(numero, quadras(codigo))')
        .eq('empreendimento_id', empreendimentoId)
        .eq('situacao', 'ativa')
        .order('data_venda')
        .range(de, ate),
    ),
  ])
  const nomeLote = (l: { numero: string; quadras: { codigo: string } | null } | null) =>
    `Quadra ${l?.quadras?.codigo ?? '?'} · Lote ${l?.numero ?? '?'}`

  const faixas = { ate30: 0, ate90: 0, acima90: 0 }
  const lista: ContratoNaCarteira[] = contratos.map((c) => {
    const abertas = parcelas.filter((p) => p.contrato_id === c.id)
    const vencidas = abertas.filter((p) => p.vencimento < hoje)
    const maisAntiga = vencidas.reduce<string | null>(
      (m, p) => (m === null || p.vencimento < m ? p.vencimento : m),
      null,
    )
    const maiorAtraso = maisAntiga ? diasEntre(maisAntiga, hoje) : 0
    if (maiorAtraso > 90) faixas.acima90++
    else if (maiorAtraso > 30) faixas.ate90++
    else if (maiorAtraso > 0) faixas.ate30++
    const proximo = abertas
      .filter((p) => p.vencimento >= hoje)
      .reduce<string | null>((m, p) => (m === null || p.vencimento < m ? p.vencimento : m), null)
    return {
      id: c.id,
      lote: nomeLote(c.lotes),
      comprador: c.compradores?.nome ?? null,
      situacao: c.situacao,
      saldoCentavos: abertas.reduce((s, p) => s + p.valor_centavos - p.pago_centavos, 0),
      vencidoCentavos: vencidas.reduce((s, p) => s + p.valor_centavos - p.pago_centavos, 0),
      parcelasVencidas: vencidas.length,
      maiorAtraso,
      proximoVencimento: proximo,
    }
  })
  const comContrato = new Set(contratos.map((c) => c.venda_id))
  return {
    contratos: lista.sort((a, b) => b.maiorAtraso - a.maiorAtraso || a.lote.localeCompare(b.lote)),
    vendasSemContrato: vendas
      .filter((v) => !comContrato.has(v.id))
      .map((v) => ({
        vendaId: v.id,
        loteId: v.lote_id,
        lote: nomeLote(v.lotes),
        dataVenda: v.data_venda,
      })),
    totais: {
      saldoCentavos: lista.reduce((s, c) => s + c.saldoCentavos, 0),
      vencidoCentavos: lista.reduce((s, c) => s + c.vencidoCentavos, 0),
      recebidoNoMesCentavos: recebidos.reduce((s, r) => s + r.valor_centavos, 0),
      contratosInadimplentes: lista.filter((c) => c.parcelasVencidas > 0).length,
      faixas,
    },
  }
}

/** Parcelas e recebimentos dos contratos do empreendimento, por venda, no formato da projeção. */
export async function parcelasPorVenda(
  db: ClienteBanco,
  empreendimentoId: string,
): Promise<Map<string, ParcelaReal[]>> {
  const [parcelas, recebimentos] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('parcelas')
        .select(
          'id, numero, vencimento, valor_centavos, amortizacao_centavos, juros_centavos, correcao_centavos, situacao, contratos!inner(venda_id, empreendimento_id)',
        )
        .eq('contratos.empreendimento_id', empreendimentoId)
        .order('id')
        .range(de, ate),
    ),
    paginar((de, ate) =>
      db
        .from('recebimentos')
        .select(
          'parcela_id, data_pagamento, principal_centavos, multa_centavos, juros_mora_centavos, desconto_centavos, parcelas!inner(contratos!inner(empreendimento_id))',
        )
        .eq('parcelas.contratos.empreendimento_id', empreendimentoId)
        .is('estornado_em', null)
        .order('id')
        .range(de, ate),
    ),
  ])
  const porParcela = new Map<string, ParcelaReal['recebimentos'][number][]>()
  for (const r of recebimentos) {
    const lista = porParcela.get(r.parcela_id) ?? []
    lista.push({
      data: r.data_pagamento,
      principalCentavos: r.principal_centavos,
      encargosCentavos: r.multa_centavos + r.juros_mora_centavos - r.desconto_centavos,
    })
    porParcela.set(r.parcela_id, lista)
  }
  const resultado = new Map<string, ParcelaReal[]>()
  for (const p of parcelas) {
    const venda = p.contratos.venda_id
    const lista = resultado.get(venda) ?? []
    lista.push({
      numero: p.numero,
      vencimento: p.vencimento,
      valorCentavos: p.valor_centavos,
      amortizacaoCentavos: p.amortizacao_centavos,
      jurosCentavos: p.juros_centavos,
      correcaoCentavos: p.correcao_centavos,
      situacao: p.situacao as ParcelaReal['situacao'],
      recebimentos: porParcela.get(p.id) ?? [],
    })
    resultado.set(venda, lista)
  }
  return resultado
}

export interface DadosRenegociacao {
  data: string
  motivo: string
  incorporarEncargos: boolean
  descontoCentavos: number
  parcelas: number
  jurosMensal: string
  sistema: 'price' | 'sac'
  primeiraParcelaEm: string
}

/**
 * Renegociação por aditivo (RN-K07): saldo em aberto (+ encargos das vencidas, se
 * incorporados, calculados pelo motor com a regra do contrato) − desconto, em novo plano do
 * motor numerado a partir da última parcela. O banco confere e guarda a foto do plano anterior.
 */
export async function renegociarContrato(
  db: ClienteBanco,
  contratoId: string,
  d: DadosRenegociacao,
): Promise<string> {
  const [{ data: c, error }, abertas] = await Promise.all([
    db.from('contratos').select('multa_atraso, juros_mora_mensal').eq('id', contratoId).single(),
    paginar((de, ate) =>
      db
        .from('parcelas')
        .select('numero, vencimento, valor_centavos, pago_centavos, situacao')
        .eq('contrato_id', contratoId)
        .order('numero')
        .range(de, ate),
    ),
  ])
  falhar(error)
  const regra = regraDe(c!)
  const emAberto = abertas.filter((p) => p.situacao === 'aberta')
  const saldo = emAberto.reduce((t, p) => t + p.valor_centavos - p.pago_centavos, 0)
  const encargos = d.incorporarEncargos
    ? emAberto.reduce((t, p) => {
        const e = calcularEncargos(
          centavos(p.valor_centavos - p.pago_centavos),
          p.vencimento,
          d.data,
          regra,
        )
        return t + e.multa + e.jurosMora
      }, 0)
    : 0
  const novo = saldo + encargos - d.descontoCentavos
  if (saldo <= 0) throw new ErroAplicacao('O contrato não tem saldo em aberto.', 'invalido')
  if (d.descontoCentavos < 0 || novo <= 0)
    throw new ErroAplicacao('O desconto não pode zerar o saldo.', 'invalido', 'desconto')
  const ultimo = abertas.reduce((m, p) => Math.max(m, p.numero), 0)
  const plano = gerarParcelasContrato({
    precoCentavos: centavos(novo),
    entradaCentavos: centavos(0),
    dataEntrada: d.data,
    parcelas: d.parcelas,
    jurosMensal: new Decimal(d.jurosMensal),
    sistema: d.sistema,
    primeiraParcelaEm: d.primeiraParcelaEm,
  })
  const { data, error: erro } = await db.rpc('renegociar_contrato', {
    p_contrato: contratoId,
    p_data: d.data,
    p_motivo: d.motivo,
    p_encargos: encargos,
    p_desconto: d.descontoCentavos,
    p_condicoes: {
      parcelas: d.parcelas,
      juros_mensal: d.jurosMensal,
      sistema: d.sistema,
      primeira_parcela_em: d.primeiraParcelaEm,
      encargos_incorporados: d.incorporarEncargos,
    },
    p_parcelas: plano.map((p) => ({
      numero: ultimo + p.numero,
      vencimento: p.vencimento,
      valor_centavos: p.valor,
      amortizacao_centavos: p.amortizacao,
      juros_centavos: p.juros,
    })),
  })
  falhar(erro)
  return data!
}

/**
 * Antecipação (RN-K08): baixa das parcelas a vencer escolhidas, com o desconto dos juros não
 * decorridos calculado pelo motor à taxa do contrato.
 */
export async function anteciparParcelas(
  db: ClienteBanco,
  contratoId: string,
  parcelaIds: string[],
  data: string,
): Promise<{ parcelas: number; descontoCentavos: number }> {
  if (parcelaIds.length === 0)
    throw new ErroAplicacao('Escolha as parcelas a antecipar.', 'invalido')
  const [{ data: c, error }, { data: lista, error: erroParcelas }] = await Promise.all([
    db.from('contratos').select('vendas(juros_mensal)').eq('id', contratoId).single(),
    db
      .from('parcelas')
      .select('id, vencimento, valor_centavos, pago_centavos')
      .eq('contrato_id', contratoId)
      .in('id', parcelaIds),
  ])
  falhar(error)
  falhar(erroParcelas)
  const taxa = new Decimal(String(c!.vendas?.juros_mensal ?? 0))
  const itens = (lista ?? []).map((p) => ({
    parcela: p.id,
    desconto_centavos: descontoAntecipacao(
      centavos(p.valor_centavos - p.pago_centavos),
      p.vencimento,
      data,
      taxa,
    ),
  }))
  const { error: erro } = await db.rpc('antecipar_parcelas', {
    p_contrato: contratoId,
    p_data: data,
    p_itens: itens,
  })
  falhar(erro)
  return {
    parcelas: itens.length,
    descontoCentavos: itens.reduce((t, i) => t + i.desconto_centavos, 0),
  }
}
