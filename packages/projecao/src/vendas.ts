import {
  CATEGORIAS_DE_RECEITA,
  Decimal,
  type Lancamento,
  type PremissasViabilidade,
  type ProjecaoViabilidade,
  agregarPorMes,
  projetarViabilidade,
  tabelaAmortizacao,
} from '@norteia/motor-financeiro'
import { mesDoFluxo } from './datas'
import { type PermutaFinanceira, apurarRepasses } from './permutas'

/** Recebimento não estornado de uma parcela do contrato. */
export interface RecebimentoReal {
  data: string
  principalCentavos: number
  /** Multa + juros de mora − desconto. */
  encargosCentavos: number
}

/** Parcela do contrato (Fase 5), com o que já foi recebido. */
export interface ParcelaReal {
  /** 0 = entrada. */
  numero: number
  vencimento: string
  valorCentavos: number
  amortizacaoCentavos: number
  jurosCentavos: number
  /** Correção monetária acumulada pelos reajustes (RN-K03); entra como receita imobiliária. */
  correcaoCentavos: number
  situacao: 'aberta' | 'paga' | 'cancelada'
  recebimentos: readonly RecebimentoReal[]
}

/** Parcela da devolução de um distrato (RN-D03). */
export interface DevolucaoReal {
  vencimento: string
  valorCentavos: number
  /** Data do pagamento; nula = a pagar. */
  pagoEm: string | null
}

/** Venda registrada (Fase 4). Com contrato, as parcelas reais substituem a tabela da venda. */
export interface VendaReal {
  dataVenda: string
  precoCentavos: number
  entradaCentavos: number
  parcelas: number
  jurosMensal: string
  sistema: 'price' | 'sac'
  primeiraParcelaEm: string | null
  comissaoPercentual: string
  comissaoModo: 'ato' | 'recebido'
  /** Parcelas do contrato (Fase 5). Sem contrato, a tabela é recalculada a partir da venda. */
  contrato?: readonly ParcelaReal[]
  /** Distrato executado: a venda sai do VGV, o lote volta ao estoque e a devolução é saída. */
  distrato?: { data?: string | null; devolucoes: readonly DevolucaoReal[] }
  /** Identificação para extratos (ex.: "Quadra A · Lote 1"). */
  rotulo?: string
}

export interface EntradaReceitas {
  dataBase: string
  hoje: string
  /** Premissas do plano vigente: inadimplência, tributos e ritmo para o estoque restante. */
  premissas: PremissasViabilidade
  vendas: readonly VendaReal[]
  /** Permutas financeiras do empreendimento (RN-T03). */
  permutas?: readonly PermutaFinanceira[]
}

const UM = new Decimal(1)

/**
 * Receitas do empreendimento a partir das vendas reais e do estoque restante projetado no
 * ritmo do plano, nunca antes do mês atual (natureza "projetado"). Vendas com contrato: o
 * recebido entra como "realizado" no mês do pagamento (encargos como receita de juros) e o
 * saldo em aberto como "carteira" no vencimento — as vencidas, no mês atual. Comissões no ato
 * ou proporcionais ao recebido (RN-C06); tributos sobre o recebido (RN-F14).
 */
export function projetarReceitas(e: EntradaReceitas): ProjecaoViabilidade {
  const p = e.premissas
  const mesAtual = mesDoFluxo(e.dataBase, e.hoje)
  const lancamentos: Lancamento[] = []
  const lancar = (
    mes: number,
    valor: Decimal,
    categoria: Lancamento['categoria'],
    centro: string,
    natureza: Lancamento['natureza'] = 'carteira',
  ) => {
    if (!valor.isZero()) lancamentos.push({ mes, valor, categoria, natureza, centroCusto: centro })
  }
  const recebe = UM.minus(p.inadimplencia)
  const recebeEntrada = p.inadimplenciaNaEntrada ? recebe : UM
  let vgvReal = new Decimal(0)
  const vendasPorMes: number[] = []

  for (const v of e.vendas) {
    const mesVenda = mesDoFluxo(e.dataBase, v.dataVenda)
    if (v.distrato) {
      for (const d of v.distrato.devolucoes)
        lancar(
          d.pagoEm
            ? mesDoFluxo(e.dataBase, d.pagoEm)
            : Math.max(mesDoFluxo(e.dataBase, d.vencimento), mesAtual),
          new Decimal(d.valorCentavos).negated(),
          'devolucao_distrato',
          'carteira',
          d.pagoEm ? 'realizado' : 'comprometido',
        )
    } else {
      while (vendasPorMes.length <= mesVenda) vendasPorMes.push(0)
      vendasPorMes[mesVenda]!++
      vgvReal = vgvReal.plus(v.precoCentavos)
    }
    const comissao = new Decimal(v.comissaoPercentual)
    const porRecebido = v.comissaoModo === 'recebido'

    const lancarComissaoNoAto = () =>
      lancar(
        mesVenda,
        new Decimal(v.precoCentavos).times(comissao).negated(),
        'comissao',
        'comercial.comissao',
      )
    if (v.contrato) {
      if (!porRecebido) lancarComissaoNoAto()
      for (const pc of v.contrato) {
        const fracao = new Decimal(pc.amortizacaoCentavos + pc.correcaoCentavos).div(
          pc.valorCentavos,
        )
        const centro = pc.numero === 0 ? 'vendas' : 'carteira'
        const parte = (
          mes: number,
          principal: Decimal,
          encargos: Decimal,
          natureza: Lancamento['natureza'],
        ) => {
          const amortizacao = principal.times(fracao)
          lancar(mes, amortizacao, 'receita_imobiliaria', centro, natureza)
          lancar(
            mes,
            principal.minus(amortizacao).plus(encargos),
            'receita_juros',
            centro,
            natureza,
          )
          if (porRecebido)
            lancar(
              mes,
              amortizacao.times(comissao).negated(),
              'comissao',
              'comercial.comissao',
              natureza === 'realizado' ? 'comprometido' : natureza,
            )
        }
        let pago = 0
        for (const r of pc.recebimentos) {
          pago += r.principalCentavos
          parte(
            mesDoFluxo(e.dataBase, r.data),
            new Decimal(r.principalCentavos),
            new Decimal(r.encargosCentavos),
            'realizado',
          )
        }
        // Parcela substituída por aditivo: o que já foi pago fica; o saldo está no novo plano.
        const saldo = new Decimal(pc.situacao === 'cancelada' ? 0 : pc.valorCentavos - pago)
        if (saldo.gt(0))
          parte(
            Math.max(mesDoFluxo(e.dataBase, pc.vencimento), mesAtual),
            saldo.times(pc.numero === 0 ? recebeEntrada : recebe),
            new Decimal(0),
            'carteira',
          )
      }
      continue
    }

    const entrada = new Decimal(v.entradaCentavos).times(recebeEntrada)
    lancar(mesVenda, entrada, 'receita_imobiliaria', 'vendas')
    if (porRecebido)
      lancar(mesVenda, entrada.times(comissao).negated(), 'comissao', 'comercial.comissao')
    else lancarComissaoNoAto()

    if (v.parcelas > 0 && v.primeiraParcelaEm) {
      const primeira = mesDoFluxo(e.dataBase, v.primeiraParcelaEm)
      const financiado = new Decimal(v.precoCentavos - v.entradaCentavos)
      for (const parcela of tabelaAmortizacao(
        v.sistema,
        financiado,
        new Decimal(v.jurosMensal),
        v.parcelas,
      )) {
        const mes = primeira + parcela.numero - 1
        const amortizacao = parcela.amortizacao.times(recebe)
        lancar(mes, amortizacao, 'receita_imobiliaria', 'carteira')
        lancar(mes, parcela.juros.times(recebe), 'receita_juros', 'carteira')
        if (porRecebido)
          lancar(mes, amortizacao.times(comissao).negated(), 'comissao', 'comercial.comissao')
      }
    }
  }

  // Tributos sobre o que as vendas reais trazem de caixa (o já recebido fica comprometido)
  for (const [natureza, tributo] of [
    ['carteira', 'carteira'],
    ['realizado', 'comprometido'],
  ] as const) {
    const receitas = agregarPorMes(
      lancamentos.filter((l) => l.natureza === natureza),
      p.base,
      CATEGORIAS_DE_RECEITA,
    )
    for (const [mes, recebido] of receitas.valores.entries())
      lancar(mes, recebido.times(p.aliquotaSobreRecebido).negated(), 'tributo', 'tributos', tributo)
  }

  // Estoque restante no ritmo do plano
  const restantes = Math.max(0, p.lotesVendaveis - e.vendas.filter((v) => !v.distrato).length)
  const projetadas = projetarViabilidade({
    ...p,
    lotesVendaveis: restantes,
    vendas: { ...p.vendas, mesInicio: Math.max(p.vendas.mesInicio, mesAtual) },
    custos: [],
  })
  for (const [mes, q] of projetadas.vendasPorMes.entries()) {
    while (vendasPorMes.length <= mes) vendasPorMes.push(0)
    vendasPorMes[mes]! += q
  }

  // Repasse ao permutante financeiro (RN-T03, RN-T04): pago = realizado; devido e não pago =
  // comprometido; sobre as receitas futuras, na mesma natureza delas.
  const repasses: Lancamento[] = []
  const repassar = (mes: number, valor: Decimal, natureza: Lancamento['natureza']) => {
    if (!valor.isZero())
      repasses.push({ mes, valor, categoria: 'repasse_permuta', natureza, centroCusto: 'permuta' })
  }
  for (const pm of e.permutas ?? []) {
    const pct = new Decimal(pm.percentual)
    const mesInicio = mesDoFluxo(e.dataBase, pm.inicio)
    for (const pg of pm.pagos)
      if (pg.data <= e.hoje)
        repassar(
          mesDoFluxo(e.dataBase, pg.data),
          new Decimal(pg.valorCentavos).negated(),
          'realizado',
        )
    repassar(
      mesAtual,
      new Decimal(apurarRepasses(pm, e.vendas, e.hoje).saldoCentavos).negated(),
      'comprometido',
    )
    if (pm.base === 'vgv') {
      for (const [m, q] of projetadas.vendasPorMes.entries())
        if (q && m >= mesInicio)
          repassar(m, new Decimal(p.precoLoteCentavos).times(q).times(pct).negated(), 'projetado')
    } else {
      const futuras = [
        ...lancamentos.filter((l) => l.natureza === 'carteira'),
        ...projetadas.lancamentos.filter((l) => l.natureza === 'projetado'),
      ]
      for (const l of futuras)
        if (
          l.mes >= mesInicio &&
          (l.categoria === 'receita_imobiliaria' ||
            (pm.base === 'recebido' && l.categoria === 'receita_juros'))
        )
          repassar(l.mes, l.valor.times(pct).negated(), l.natureza)
      if (pm.abateDistrato)
        for (const v of e.vendas)
          for (const d of v.distrato?.devolucoes ?? [])
            if (!d.pagoEm)
              repassar(
                Math.max(mesDoFluxo(e.dataBase, d.vencimento), mesAtual),
                new Decimal(d.valorCentavos).times(pct),
                'comprometido',
              )
    }
  }

  return {
    base: p.base,
    lancamentos: [...lancamentos, ...projetadas.lancamentos, ...repasses],
    vendasPorMes,
    vgvVendido: vgvReal.plus(projetadas.vgvVendido),
  }
}
