import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { diasEntre, somarMeses } from './encargos'
import { ErroMotor } from './fluxo'

/** Regras do distrato — todas parâmetros do cliente/contrato (RN-D01, D-059). */
export interface RegrasDistrato {
  /** Cláusula penal + despesas administrativas, fração do valor atualizado do contrato. */
  clausulaPenal: Decimal
  /** Taxa de fruição ao mês, fração do valor atualizado do contrato, enquanto houve posse. */
  fruicaoMensal: Decimal
  /** Deduz os encargos moratórios pagos pelo comprador. */
  deduzEncargosMoratorios: boolean
  /** Deduz a comissão de corretagem paga. */
  deduzComissao: boolean
  /** Número de parcelas da devolução. */
  parcelasDevolucao: number
  /** Meses entre o distrato e a 1ª parcela da devolução. */
  carenciaMeses: number
  /**
   * Teto de cláusula penal + despesas administrativas (art. 32-A, II), fração do valor
   * atualizado. Só avisa quando excedido; sem teto, não há aviso. // VALIDAR COM ADVOGADO
   */
  limitePenal?: Decimal
}

/** Item de desconto do cliente (documentação, taxas…), com o valor deste distrato. */
export interface ItemDeducaoDistrato {
  descricao: string
  valorCentavos: Centavos
  /** Conta dentro do teto da cláusula penal + despesas administrativas. */
  dentroDoLimite: boolean
}

export interface EntradaDistrato {
  data: string
  precoCentavos: Centavos
  /** Fator de correção do preço até a data do distrato (índice do contrato; 1 = sem correção). */
  fatorPreco: Decimal
  /** Recebimentos não estornados, cada um com o fator de correção até o distrato (RN-D02). */
  recebimentos: readonly { valorCentavos: Centavos; encargosCentavos: Centavos; fator: Decimal }[]
  /** Data de imissão na posse; nula = sem posse, sem fruição. */
  posseDesde: string | null
  comissaoPagaCentavos: Centavos
  /** Outros débitos do comprador (IPTU, contribuições), informados no distrato. */
  outrosDebitosCentavos: Centavos
  /** Itens de desconto cadastrados pelo cliente, com o valor deste distrato. */
  itens?: readonly ItemDeducaoDistrato[]
  regras: RegrasDistrato
}

export interface ResultadoDistrato {
  pagoCentavos: Centavos
  pagoAtualizadoCentavos: Centavos
  valorContratoAtualizadoCentavos: Centavos
  mesesPosse: number
  deducoes: {
    clausulaPenal: Centavos
    fruicao: Centavos
    encargosMoratorios: Centavos
    comissao: Centavos
    outrosDebitos: Centavos
    itens: ItemDeducaoDistrato[]
  }
  /** Cláusula penal + itens dentro do limite, comparados ao teto (quando há teto). */
  limite: { tetoCentavos: Centavos; usadoCentavos: Centavos; excede: boolean } | null
  devolucaoCentavos: Centavos
  parcelas: { numero: number; vencimento: string; valorCentavos: Centavos }[]
}

const arredondar = (d: Decimal) => centavos(BigInt(d.toDecimalPlaces(0).toFixed(0)))

/**
 * Distrato (art. 32-A da Lei 6.766): devolve os valores pagos corrigidos, deduzidos cláusula
 * penal, fruição, encargos moratórios, comissão e outros débitos, conforme as regras; a
 * devolução nunca é negativa e é paga em parcelas iguais (o resíduo vai na última).
 */
export function calcularDistrato(e: EntradaDistrato): ResultadoDistrato {
  const r = e.regras
  const itens = (e.itens ?? []).map((i) => ({ ...i }))
  if (
    itens.some((i) => !Number.isInteger(i.valorCentavos) || i.valorCentavos < 0) ||
    r.limitePenal?.isNegative() ||
    r.clausulaPenal.isNegative() ||
    r.fruicaoMensal.isNegative() ||
    !Number.isInteger(r.parcelasDevolucao) ||
    r.parcelasDevolucao < 1 ||
    !Number.isInteger(r.carenciaMeses) ||
    r.carenciaMeses < 0
  ) {
    throw new ErroMotor('Regras de distrato inválidas.')
  }
  const pago = e.recebimentos.reduce((t, x) => t + x.valorCentavos, 0)
  const pagoAtualizado = e.recebimentos.reduce(
    (t, x) => t.plus(new Decimal(x.valorCentavos).times(x.fator)),
    new Decimal(0),
  )
  const valorContrato = new Decimal(e.precoCentavos).times(e.fatorPreco)
  const mesesPosse = e.posseDesde
    ? Math.max(0, Math.floor(diasEntre(e.posseDesde, e.data) / 30))
    : 0

  const deducoes = {
    clausulaPenal: arredondar(valorContrato.times(r.clausulaPenal)),
    fruicao: arredondar(valorContrato.times(r.fruicaoMensal).times(mesesPosse)),
    encargosMoratorios: centavos(
      r.deduzEncargosMoratorios ? e.recebimentos.reduce((t, x) => t + x.encargosCentavos, 0) : 0,
    ),
    comissao: centavos(r.deduzComissao ? e.comissaoPagaCentavos : 0),
    outrosDebitos: e.outrosDebitosCentavos,
    itens,
  }
  const totalItens = itens.reduce((t, i) => t + i.valorCentavos, 0)
  const totalDeducoes =
    deducoes.clausulaPenal +
    deducoes.fruicao +
    deducoes.encargosMoratorios +
    deducoes.comissao +
    deducoes.outrosDebitos +
    totalItens
  let limite: ResultadoDistrato['limite'] = null
  if (r.limitePenal) {
    const teto = arredondar(valorContrato.times(r.limitePenal))
    const usado = centavos(
      deducoes.clausulaPenal +
        itens.filter((i) => i.dentroDoLimite).reduce((t, i) => t + i.valorCentavos, 0),
    )
    limite = { tetoCentavos: teto, usadoCentavos: usado, excede: usado > teto }
  }
  const devolucao = centavos(Math.max(0, Number(arredondar(pagoAtualizado)) - totalDeducoes))

  const base = Math.floor(devolucao / r.parcelasDevolucao)
  const parcelas =
    devolucao === 0
      ? []
      : Array.from({ length: r.parcelasDevolucao }, (_, i) => ({
          numero: i + 1,
          vencimento: somarMeses(e.data, r.carenciaMeses + i),
          valorCentavos: centavos(
            i === r.parcelasDevolucao - 1 ? devolucao - base * (r.parcelasDevolucao - 1) : base,
          ),
        }))
  return {
    pagoCentavos: centavos(pago),
    pagoAtualizadoCentavos: arredondar(pagoAtualizado),
    valorContratoAtualizadoCentavos: arredondar(valorContrato),
    mesesPosse,
    deducoes,
    limite,
    devolucaoCentavos: devolucao,
    parcelas,
  }
}

/** Fator acumulado de variações mensais em % (0,39 = 0,39%). */
export function fatorAcumulado(variacoesPercentuais: readonly Decimal[]): Decimal {
  return variacoesPercentuais.reduce(
    (f, v) => f.times(new Decimal(1).plus(v.div(100))),
    new Decimal(1),
  )
}
