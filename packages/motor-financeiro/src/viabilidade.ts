import { type SistemaAmortizacao, tabelaAmortizacao } from './amortizacao'
import { Decimal } from './decimal'
import type { Centavos } from './dinheiro'
import {
  type BaseMonetaria,
  CATEGORIAS_DE_RECEITA,
  ErroMotor,
  type Lancamento,
  agregarPorMes,
  totalPorCategoria,
} from './fluxo'
import {
  type ResultadoTir,
  exposicaoMaxima,
  necessidadeDeAporte,
  paybackDescontado,
  paybackSimples,
  tir,
  vpl,
} from './indicadores'
import type { Taxa } from './taxa'

const UM = new Decimal(1)

/** Custo distribuído igualmente entre `mesInicio` e `mesFim` (inclusive). */
export interface CustoPremissa {
  descricao: string
  centroCusto: string
  /** 'total': valor dividido igualmente no período; 'mensal': valor repetido em cada mês. */
  tipo: 'total' | 'mensal'
  valorCentavos: Centavos
  mesInicio: number
  mesFim: number
}

export interface PremissasViabilidade {
  base: BaseMonetaria
  /** Lotes à venda (os de permuta física ficam fora — RN-T01). */
  lotesVendaveis: number
  precoLoteCentavos: Centavos
  vendas: { mesInicio: number; lotesPorMes: number }
  pagamento: {
    /** Fração do preço paga no mês da venda. */
    entrada: Decimal
    parcelas: number
    jurosMensal: Decimal
    sistema: SistemaAmortizacao
    /** Meses entre a venda e a 1ª parcela (1 = mês seguinte). */
    carenciaMeses: number
  }
  /** Fração do preço, paga no mês da venda. */
  comissao: Decimal
  /** Fração de cada parcela que nunca é recebida (RN-F13). */
  inadimplencia: Decimal
  /** Por padrão a entrada é recebida integralmente (RN-F13). */
  inadimplenciaNaEntrada: boolean
  /**
   * Tributos sobre o valor efetivamente recebido (RN-F14). Vem dos parâmetros do regime
   * da SPE — nunca fixo no código. // VALIDAR COM CONTADOR (PL-07)
   */
  aliquotaSobreRecebido: Decimal
  custos: CustoPremissa[]
}

export interface ProjecaoViabilidade {
  base: BaseMonetaria
  lancamentos: Lancamento[]
  /** Lotes vendidos em cada mês. */
  vendasPorMes: number[]
  vgvVendido: Decimal
}

function validar(p: PremissasViabilidade) {
  const inteiros: [string, number][] = [
    ['lotes vendáveis', p.lotesVendaveis],
    ['início das vendas', p.vendas.mesInicio],
    ['carência', p.pagamento.carenciaMeses],
  ]
  for (const [nome, v] of inteiros) {
    if (!Number.isInteger(v) || v < 0) throw new ErroMotor(`Premissa inválida: ${nome}.`)
  }
  if (!Number.isInteger(p.vendas.lotesPorMes) || p.vendas.lotesPorMes < 1) {
    throw new ErroMotor('Premissa inválida: lotes vendidos por mês.')
  }
  for (const [nome, v] of [
    ['entrada', p.pagamento.entrada],
    ['comissão', p.comissao],
    ['inadimplência', p.inadimplencia],
    ['alíquota', p.aliquotaSobreRecebido],
  ] as const) {
    if (v.isNegative() || v.gt(1))
      throw new ErroMotor(`Premissa inválida: ${nome} deve estar entre 0 e 100%.`)
  }
  for (const c of p.custos) {
    if (
      !Number.isInteger(c.mesInicio) ||
      c.mesInicio < 0 ||
      !Number.isInteger(c.mesFim) ||
      c.mesFim < c.mesInicio
    ) {
      throw new ErroMotor(`Período inválido no custo "${c.descricao}".`)
    }
  }
}

/** Gera o fluxo projetado de um estudo de viabilidade (RN-F01, RN-F12, RN-F13, RN-F14). */
export function projetarViabilidade(p: PremissasViabilidade): ProjecaoViabilidade {
  validar(p)
  const lancamentos: Lancamento[] = []
  const lanc = (
    mes: number,
    valor: Decimal,
    categoria: Lancamento['categoria'],
    centroCusto: string,
  ) => {
    if (!valor.isZero())
      lancamentos.push({ mes, valor, categoria, natureza: 'projetado', centroCusto })
  }

  // Custos
  for (const c of p.custos) {
    const meses = c.mesFim - c.mesInicio + 1
    const porMes =
      c.tipo === 'total' ? new Decimal(c.valorCentavos).div(meses) : new Decimal(c.valorCentavos)
    for (let m = c.mesInicio; m <= c.mesFim; m++) lanc(m, porMes.negated(), 'custo', c.centroCusto)
  }

  // Vendas
  const preco = new Decimal(p.precoLoteCentavos)
  const recebe = UM.minus(p.inadimplencia)
  const recebeEntrada = p.inadimplenciaNaEntrada ? recebe : UM
  const financiado = preco.times(UM.minus(p.pagamento.entrada))
  const tabela = tabelaAmortizacao(
    p.pagamento.sistema,
    financiado,
    p.pagamento.jurosMensal,
    p.pagamento.parcelas,
  )

  const vendasPorMes: number[] = []
  let estoque = p.lotesVendaveis
  let mes = p.vendas.mesInicio
  while (estoque > 0) {
    const q = Math.min(p.vendas.lotesPorMes, estoque)
    estoque -= q
    while (vendasPorMes.length < mes) vendasPorMes.push(0)
    vendasPorMes.push(q)
    lanc(
      mes,
      preco.times(p.pagamento.entrada).times(q).times(recebeEntrada),
      'receita_imobiliaria',
      'vendas',
    )
    lanc(mes, preco.times(p.comissao).times(q).negated(), 'comissao', 'comercial.comissao')
    for (const parcela of tabela) {
      const mesParcela = mes + p.pagamento.carenciaMeses + parcela.numero - 1
      lanc(
        mesParcela,
        parcela.amortizacao.times(q).times(recebe),
        'receita_imobiliaria',
        'carteira',
      )
      lanc(mesParcela, parcela.juros.times(q).times(recebe), 'receita_juros', 'carteira')
    }
    mes++
  }

  // Tributos sobre o recebido, no mês do recebimento
  const recebidoPorMes = agregarPorMes(lancamentos, p.base, CATEGORIAS_DE_RECEITA).valores
  for (const [m, recebido] of recebidoPorMes.entries()) {
    lanc(m, recebido.times(p.aliquotaSobreRecebido).negated(), 'tributo', 'tributos')
  }

  return { base: p.base, lancamentos, vendasPorMes, vgvVendido: preco.times(p.lotesVendaveis) }
}

export interface ResumoViabilidade {
  /** RN-F10: comercial — nunca confundir com caixa. */
  vgvVendido: Decimal
  /** Dinheiro que entra (imobiliária + juros). */
  recebido: Decimal
  receitaJuros: Decimal
  /** Custos e comissões, sem tributos (valor positivo). */
  custos: Decimal
  tributos: Decimal
  lucroNominal: Decimal
  margemSobreVgv: Decimal
  tir: ResultadoTir
  vpl: Decimal
  exposicaoMaxima: { valor: Decimal; mes: number }
  paybackSimples: number | null
  paybackDescontado: number | null
  necessidadeDeAporte: Decimal[]
  fluxoMensal: Decimal[]
}

export function resumirViabilidade(
  projecao: ProjecaoViabilidade,
  tma: Taxa,
  caixaMinimo: Decimal = new Decimal(0),
): ResumoViabilidade {
  const fluxo = agregarPorMes(projecao.lancamentos, projecao.base)
  const t = totalPorCategoria(projecao.lancamentos)
  const recebido = t.receita_imobiliaria.plus(t.receita_juros)
  const custos = t.custo.plus(t.comissao).negated()
  const tributos = t.tributo.negated()
  const lucro = recebido.minus(custos).minus(tributos)
  return {
    vgvVendido: projecao.vgvVendido,
    recebido,
    receitaJuros: t.receita_juros,
    custos,
    tributos,
    lucroNominal: lucro,
    margemSobreVgv: projecao.vgvVendido.isZero() ? new Decimal(0) : lucro.div(projecao.vgvVendido),
    tir: tir(fluxo),
    vpl: vpl(fluxo, tma),
    exposicaoMaxima: exposicaoMaxima(fluxo),
    paybackSimples: paybackSimples(fluxo),
    paybackDescontado: paybackDescontado(fluxo, tma),
    necessidadeDeAporte: necessidadeDeAporte(fluxo, caixaMinimo),
    fluxoMensal: fluxo.valores,
  }
}
