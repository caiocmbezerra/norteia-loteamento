import type { ClienteBanco } from '@norteia/db'
import {
  Decimal,
  type RegrasDistrato,
  type ResultadoDistrato,
  calcularDistrato,
  centavos,
  fatorAcumulado,
} from '@norteia/motor-financeiro'
import { paginar } from './carteira'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface EntradaSimulacaoDistrato {
  data: string
  posseDesde: string | null
  outrosDebitosCentavos: number
  /** Ajustes deste contrato sobre os parâmetros do cliente (RN-D01). */
  ajustes?: Partial<
    Pick<RegrasDistrato, 'clausulaPenal' | 'fruicaoMensal' | 'parcelasDevolucao' | 'carenciaMeses'>
  >
}

export interface SimulacaoDistrato extends ResultadoDistrato {
  regras: {
    clausulaPenal: string
    fruicaoMensal: string
    deduzEncargosMoratorios: boolean
    deduzComissao: boolean
    parcelasDevolucao: number
    carenciaMeses: number
  }
  indice: string | null
}

const inicioMes = (d: string) => `${d.slice(0, 7)}-01`

/** Regras do distrato vigentes para o empreendimento na data (parâmetros do cliente). */
export async function regrasDistrato(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  data: string,
): Promise<RegrasDistrato> {
  const ler = async (chave: string) => {
    const { data: v, error } = await db.rpc('parametro_vigente', {
      p_chave: chave,
      p_data: data,
      p_tenant: tenantId,
      p_escopo: 'empreendimento',
      p_escopo_id: empreendimentoId,
    })
    falhar(error)
    if (v === null || v === undefined)
      throw new ErroAplicacao(
        `Defina o parâmetro "${chave}" em Configurações → Parâmetros.`,
        'parametro',
      )
    return String(v).replace(/^"|"$/g, '')
  }
  const [penal, fruicao, encargos, comissao, parcelas, carencia] = await Promise.all([
    ler('distrato.clausula_penal'),
    ler('distrato.fruicao_mensal'),
    ler('distrato.deduz_encargos_moratorios'),
    ler('distrato.deduz_comissao'),
    ler('distrato.parcelas_devolucao'),
    ler('distrato.carencia_devolucao_meses'),
  ])
  return {
    clausulaPenal: new Decimal(penal),
    fruicaoMensal: new Decimal(fruicao),
    deduzEncargosMoratorios: encargos === 'true',
    deduzComissao: comissao === 'true',
    parcelasDevolucao: Number(parcelas),
    carenciaMeses: Number(carencia),
  }
}

/**
 * Simulação do distrato (RN-D01, RN-D02): recebimentos e preço corrigidos pelo índice do
 * contrato (meses publicados entre o pagamento e o distrato), deduções pelas regras do cliente.
 */
export async function simularDistrato(
  db: ClienteBanco,
  tenantId: string,
  contratoId: string,
  e: EntradaSimulacaoDistrato,
): Promise<SimulacaoDistrato> {
  const { data: c, error } = await db
    .from('contratos')
    .select(
      'empreendimento_id, indice_reajuste, situacao, vendas(data_venda, preco_centavos, comissao_percentual, comissao_modo)',
    )
    .eq('id', contratoId)
    .single()
  falhar(error)
  if (c!.situacao !== 'vigente')
    throw new ErroAplicacao('Só contratos vigentes são distratados.', 'invalido')
  const v = c!.vendas!
  const [base, recebimentos, indices] = await Promise.all([
    regrasDistrato(db, tenantId, c!.empreendimento_id, e.data),
    paginar((de, ate) =>
      db
        .from('recebimentos')
        .select(
          'data_pagamento, valor_centavos, principal_centavos, multa_centavos, juros_mora_centavos, parcelas!inner(contrato_id)',
        )
        .eq('parcelas.contrato_id', contratoId)
        .is('estornado_em', null)
        .order('id')
        .range(de, ate),
    ),
    c!.indice_reajuste
      ? paginar((de, ate) =>
          db
            .from('indice_valores')
            .select('competencia, variacao_mensal')
            .eq('codigo', c!.indice_reajuste!)
            .gte('competencia', inicioMes(v.data_venda))
            .lt('competencia', inicioMes(e.data))
            .order('competencia')
            .range(de, ate),
        )
      : Promise.resolve([] as { competencia: string; variacao_mensal: number }[]),
  ])
  const fatorDesde = (data: string) =>
    fatorAcumulado(
      indices
        .filter((i) => i.competencia > inicioMes(data))
        .map((i) => new Decimal(String(i.variacao_mensal))),
    )
  const regras: RegrasDistrato = { ...base, ...e.ajustes }
  const pct = new Decimal(String(v.comissao_percentual))
  const comissaoPaga =
    v.comissao_modo === 'ato'
      ? new Decimal(v.preco_centavos).times(pct)
      : recebimentos.reduce(
          (t, r) => t.plus(new Decimal(r.principal_centavos).times(pct)),
          new Decimal(0),
        )
  const resultado = calcularDistrato({
    data: e.data,
    precoCentavos: centavos(v.preco_centavos),
    fatorPreco: fatorDesde(v.data_venda),
    recebimentos: recebimentos.map((r) => ({
      valorCentavos: centavos(r.valor_centavos),
      encargosCentavos: centavos(r.multa_centavos + r.juros_mora_centavos),
      fator: fatorDesde(r.data_pagamento),
    })),
    posseDesde: e.posseDesde,
    comissaoPagaCentavos: centavos(Number(comissaoPaga.toDecimalPlaces(0).toFixed(0))),
    outrosDebitosCentavos: centavos(e.outrosDebitosCentavos),
    regras,
  })
  return {
    ...resultado,
    indice: c!.indice_reajuste,
    regras: {
      clausulaPenal: regras.clausulaPenal.toString(),
      fruicaoMensal: regras.fruicaoMensal.toString(),
      deduzEncargosMoratorios: regras.deduzEncargosMoratorios,
      deduzComissao: regras.deduzComissao,
      parcelasDevolucao: regras.parcelasDevolucao,
      carenciaMeses: regras.carenciaMeses,
    },
  }
}

/** Executa o distrato recalculando no servidor (RN-D03). */
export async function executarDistrato(
  db: ClienteBanco,
  tenantId: string,
  contratoId: string,
  e: EntradaSimulacaoDistrato,
  motivo: string,
): Promise<string> {
  const s = await simularDistrato(db, tenantId, contratoId, e)
  const { data, error } = await db.rpc('executar_distrato', {
    p_contrato: contratoId,
    p_data: e.data,
    p_motivo: motivo,
    p_resumo: {
      devolucao_centavos: s.devolucaoCentavos,
      pago_centavos: s.pagoCentavos,
      pago_atualizado_centavos: s.pagoAtualizadoCentavos,
      valor_contrato_atualizado_centavos: s.valorContratoAtualizadoCentavos,
      meses_posse: s.mesesPosse,
      posse_desde: e.posseDesde,
      deducoes: s.deducoes,
      regras: s.regras,
      indice: s.indice,
    },
    p_devolucoes: s.parcelas.map((p) => ({
      numero: p.numero,
      vencimento: p.vencimento,
      valor_centavos: p.valorCentavos,
    })),
  })
  falhar(error)
  return data!
}

export async function pagarDevolucao(db: ClienteBanco, devolucaoId: string, data: string) {
  const { error } = await db.rpc('pagar_devolucao', { p_devolucao: devolucaoId, p_data: data })
  falhar(error)
}
