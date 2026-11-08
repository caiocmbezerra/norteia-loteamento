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

/** Venda registrada (Fase 4). Os recebimentos reais entram na Fase 5 (cobrança). */
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
}

export interface EntradaReceitas {
  dataBase: string
  hoje: string
  /** Premissas do plano vigente: inadimplência, tributos e ritmo para o estoque restante. */
  premissas: PremissasViabilidade
  vendas: readonly VendaReal[]
}

const UM = new Decimal(1)

/**
 * Receitas do empreendimento a partir das vendas reais (natureza "carteira") e do estoque
 * restante projetado no ritmo do plano, nunca antes do mês atual (natureza "projetado").
 * Comissões no ato ou proporcionais ao recebido (RN-C06); tributos sobre o recebido (RN-F14).
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
  ) => {
    if (!valor.isZero())
      lancamentos.push({ mes, valor, categoria, natureza: 'carteira', centroCusto: centro })
  }
  const recebe = UM.minus(p.inadimplencia)
  const recebeEntrada = p.inadimplenciaNaEntrada ? recebe : UM
  let vgvReal = new Decimal(0)
  const vendasPorMes: number[] = []

  for (const v of e.vendas) {
    const mesVenda = mesDoFluxo(e.dataBase, v.dataVenda)
    while (vendasPorMes.length <= mesVenda) vendasPorMes.push(0)
    vendasPorMes[mesVenda]!++
    vgvReal = vgvReal.plus(v.precoCentavos)
    const comissao = new Decimal(v.comissaoPercentual)
    const porRecebido = v.comissaoModo === 'recebido'

    const entrada = new Decimal(v.entradaCentavos).times(recebeEntrada)
    lancar(mesVenda, entrada, 'receita_imobiliaria', 'vendas')
    if (porRecebido)
      lancar(mesVenda, entrada.times(comissao).negated(), 'comissao', 'comercial.comissao')
    else
      lancar(
        mesVenda,
        new Decimal(v.precoCentavos).times(comissao).negated(),
        'comissao',
        'comercial.comissao',
      )

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

  // Tributos sobre o que as vendas reais devem trazer de caixa
  for (const [mes, recebido] of agregarPorMes(
    lancamentos,
    p.base,
    CATEGORIAS_DE_RECEITA,
  ).valores.entries()) {
    lancar(mes, recebido.times(p.aliquotaSobreRecebido).negated(), 'tributo', 'tributos')
  }

  // Estoque restante no ritmo do plano
  const restantes = Math.max(0, p.lotesVendaveis - e.vendas.length)
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

  return {
    base: p.base,
    lancamentos: [...lancamentos, ...projetadas.lancamentos],
    vendasPorMes,
    vgvVendido: vgvReal.plus(projetadas.vgvVendido),
  }
}
